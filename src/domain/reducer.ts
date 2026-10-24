import type { SessionEvent } from './events';
import { nextDocCode } from './documents';
import {
  expireTimer,
  extendTimer,
  makeTimer,
  pauseTimer,
  resetTimer,
  resumeTimer,
  startTimer,
} from './timer';
import type {
  FloorState,
  ModerationState,
  SessionMeta,
  SessionState,
  TimerState,
  TimerTarget,
} from './types';

/* ==========================================================================
 * 初始状态
 * ========================================================================== */

export function createInitialState(meta: SessionMeta, defaultSpeechSec = 90): SessionState {
  return {
    meta,
    phase: 'idle',
    agenda: null,
    attendance: {},
    gsl: { order: [], currentIndex: -1 },
    floor: {
      speakingId: null,
      source: 'none',
      timer: makeTimer(defaultSpeechSec * 1000),
      yield: null,
      yieldUsed: false,
    },
    moderation: {
      kind: null,
      topicZh: '',
      totalSec: 0,
      perSpeakerSec: 0,
      queue: [],
      currentSpeaker: null,
      timer: makeTimer(0),
      totalTimer: makeTimer(0),
    },
    motions: [],
    activeVote: null,
    votes: [],
    documents: [],
  };
}

const EMPTY_MODERATION: ModerationState = {
  kind: null,
  topicZh: '',
  totalSec: 0,
  perSpeakerSec: 0,
  queue: [],
  currentSpeaker: null,
  timer: makeTimer(0),
  totalTimer: makeTimer(0),
};

/* ==========================================================================
 * 内部工具
 * ========================================================================== */

/** 让某个代表上台：重置让渡标记、换人、启动计时 */
function takeFloor(
  speakerId: string,
  source: FloorState['source'],
  durationSec: number,
  now: number,
): FloorState {
  return {
    speakingId: speakerId,
    source,
    timer: startTimer(makeTimer(durationSec * 1000), now),
    yield: null,
    yieldUsed: false,
  };
}

/**
 * 计时器寻址：把一次计时操作路由到正确的那个计时器。
 * 三个计时器（讲台 / 磋商单人 / 磋商总时长）互不干扰，共用同一套事件名。
 */
function withTimer(
  state: SessionState,
  target: TimerTarget | undefined,
  fn: (t: TimerState, now: number) => TimerState,
  now: number,
): SessionState {
  const t = target ?? 'floor';
  if (t === 'floor') {
    return { ...state, floor: { ...state.floor, timer: fn(state.floor.timer, now) } };
  }
  if (t === 'caucus_speaker') {
    return { ...state, moderation: { ...state.moderation, timer: fn(state.moderation.timer, now) } };
  }
  return {
    ...state,
    moderation: { ...state.moderation, totalTimer: fn(state.moderation.totalTimer, now) },
  };
}

/* ==========================================================================
 * Reducer：唯一的状态演化入口
 * ========================================================================== */

export function reduce(state: SessionState, ev: SessionEvent): SessionState {
  const now = ev.ts;

  switch (ev.kind) {
    /* ---------------- 生命周期 ---------------- */
    case 'session/opened':
      return {
        ...state,
        meta: { ...state.meta, status: 'open', openedAt: now, label: ev.payload.label },
        phase: 'rollcall',
      };

    case 'session/closed':
      return {
        ...state,
        meta: { ...state.meta, status: 'closed', closedAt: now },
        phase: 'closed',
      };

    case 'agenda/set':
      return {
        ...state,
        agenda: { topicZh: ev.payload.topicZh, topicEn: ev.payload.topicEn },
        phase: state.phase === 'rollcall' ? 'agenda' : state.phase,
      };

    case 'phase/set':
      return { ...state, phase: ev.payload.phase };

    /* ---------------- 点名 ---------------- */
    case 'rollcall/marked':
      return {
        ...state,
        attendance: { ...state.attendance, [ev.payload.delegationId]: ev.payload.status },
      };

    case 'rollcall/markAll': {
      const next = { ...state.attendance };
      for (const id of ev.payload.delegationIds) next[id] = ev.payload.status;
      return { ...state, attendance: next };
    }

    case 'rollcall/reset':
      return { ...state, attendance: {} };

    /* ---------------- 主发言名单 ---------------- */
    case 'gsl/add': {
      const { delegationId } = ev.payload;
      // 同一代表不可重复在列
      if (state.gsl.order.includes(delegationId)) return state;
      return { ...state, gsl: { ...state.gsl, order: [...state.gsl.order, delegationId] } };
    }

    case 'gsl/remove': {
      const idx = state.gsl.order.indexOf(ev.payload.delegationId);
      if (idx < 0) return state;
      const order = state.gsl.order.filter((id) => id !== ev.payload.delegationId);
      let currentIndex = state.gsl.currentIndex;
      if (idx < currentIndex) currentIndex -= 1;
      else if (idx === currentIndex) currentIndex = Math.min(currentIndex, order.length - 1);
      return { ...state, gsl: { order, currentIndex } };
    }

    case 'gsl/move': {
      const { from, to } = ev.payload;
      const order = [...state.gsl.order];
      if (from < 0 || from >= order.length || to < 0 || to >= order.length) return state;
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      // 正在发言的人位置变了，currentIndex 跟着走，保证高亮不串行
      const speakingId = state.floor.speakingId;
      const currentIndex = speakingId ? order.indexOf(speakingId) : state.gsl.currentIndex;
      return { ...state, gsl: { order, currentIndex } };
    }

    case 'gsl/clear':
      return {
        ...state,
        gsl: { order: [], currentIndex: -1 },
        floor: {
          ...state.floor,
          speakingId: null,
          source: 'none',
          timer: resetTimer(state.floor.timer),
          yield: null,
          yieldUsed: false,
        },
      };

    case 'gsl/advance': {
      const nextIndex = state.gsl.currentIndex + 1;
      if (nextIndex >= state.gsl.order.length) return state;
      const speakerId = state.gsl.order[nextIndex];
      return {
        ...state,
        phase: state.phase === 'rollcall' || state.phase === 'agenda' ? 'debate' : state.phase,
        gsl: { ...state.gsl, currentIndex: nextIndex },
        floor: takeFloor(speakerId, 'gsl', ev.payload.durationSec, now),
      };
    }

    /* ---------------- 计时（按 target 路由） ---------------- */
    case 'timer/start': {
      const target = ev.payload.target ?? 'floor';
      if (target !== 'floor') {
        // 磋商计时由 caucus/* 事件驱动，这里只处理重置式启动
        return withTimer(
          state,
          target,
          (_t, n) => startTimer(makeTimer(ev.payload.durationSec * 1000), n),
          now,
        );
      }
      const speakerId = ev.payload.speakerId ?? state.floor.speakingId;
      return {
        ...state,
        phase: state.phase === 'rollcall' || state.phase === 'agenda' ? 'debate' : state.phase,
        floor: {
          ...state.floor,
          speakingId: speakerId,
          source: state.floor.speakingId ? state.floor.source : 'ad_hoc',
          timer: startTimer(makeTimer(ev.payload.durationSec * 1000), now),
          yield: null,
          yieldUsed: false,
        },
      };
    }

    case 'timer/pause':
      return withTimer(state, ev.payload.target, pauseTimer, now);

    case 'timer/resume':
      return withTimer(state, ev.payload.target, resumeTimer, now);

    case 'timer/reset':
      if ((ev.payload.target ?? 'floor') === 'floor') {
        return {
          ...state,
          floor: {
            ...state.floor,
            timer: resetTimer(state.floor.timer),
            yield: null,
            yieldUsed: false,
          },
        };
      }
      return withTimer(state, ev.payload.target, (t) => resetTimer(t), now);

    case 'timer/extend':
      return withTimer(
        state,
        ev.payload.target,
        (t, n) => extendTimer(t, n, ev.payload.addSec * 1000),
        now,
      );

    case 'timer/expire':
      return withTimer(state, ev.payload.target, (t) => expireTimer(t), now);

    /* ---------------- 让渡 ---------------- */
    case 'yield/set': {
      // 禁止二次让渡
      if (state.floor.yieldUsed || !state.floor.speakingId) return state;
      const { target, toDelegationId, note } = ev.payload;
      const record = { target, toDelegationId, note, at: now };

      if (target === 'chair') {
        // 让渡主席：时间交回主席台，本轮发言结束
        return {
          ...state,
          floor: {
            ...state.floor,
            speakingId: null,
            source: 'none',
            timer: resetTimer(state.floor.timer),
            yield: record,
            yieldUsed: true,
          },
        };
      }

      if (target === 'delegate' && toDelegationId) {
        // 让渡代表：剩余时间转给对方，计时不停
        return {
          ...state,
          floor: { ...state.floor, speakingId: toDelegationId, yield: record, yieldUsed: true },
        };
      }

      // 让渡问题 / 评论：留在讲台，计时不停
      return { ...state, floor: { ...state.floor, yield: record, yieldUsed: true } };
    }

    case 'yield/clear':
      return { ...state, floor: { ...state.floor, yield: null } };

    /* ---------------- 磋商 ---------------- */
    case 'caucus/open': {
      const { kind, topicZh, totalSec, perSpeakerSec } = ev.payload;
      const totalMs = totalSec * 1000;
      return {
        ...state,
        phase: kind === 'moderated' ? 'moderated' : 'unmoderated',
        moderation: {
          kind,
          topicZh,
          totalSec,
          perSpeakerSec,
          queue: [],
          currentSpeaker: null,
          timer: makeTimer(perSpeakerSec * 1000),
          // 总时长计时器随磋商开启即自动跑，主席不用再按一次
          totalTimer: startTimer(makeTimer(totalMs), now),
        },
      };
    }

    case 'caucus/close':
      return {
        ...state,
        phase: state.phase === 'moderated' || state.phase === 'unmoderated' ? 'debate' : state.phase,
        moderation: { ...EMPTY_MODERATION, timer: makeTimer(0), totalTimer: makeTimer(0) },
      };

    case 'caucus/enqueue': {
      const { delegationId } = ev.payload;
      if (state.moderation.queue.includes(delegationId)) return state;
      if (state.moderation.currentSpeaker === delegationId) return state;
      return {
        ...state,
        moderation: {
          ...state.moderation,
          queue: [...state.moderation.queue, delegationId],
        },
      };
    }

    case 'caucus/dequeue':
      return {
        ...state,
        moderation: {
          ...state.moderation,
          queue: state.moderation.queue.filter((id) => id !== ev.payload.delegationId),
        },
      };

    case 'caucus/next': {
      const [head, ...rest] = state.moderation.queue;
      if (!head) return state;
      return {
        ...state,
        moderation: {
          ...state.moderation,
          queue: rest,
          currentSpeaker: head,
          timer: startTimer(makeTimer(state.moderation.perSpeakerSec * 1000), now),
        },
      };
    }

    /* ---------------- 动议与问题 ---------------- */
    case 'motion/propose': {
      const p = ev.payload;
      const motion = {
        id: `m-${now}-${state.motions.length + 1}`,
        typeId: p.typeId,
        typeNameZh: p.typeNameZh,
        category: p.category,
        proposerId: p.proposerId,
        topicZh: p.topicZh,
        totalSec: p.totalSec,
        perSpeakerSec: p.perSpeakerSec,
        proposedAt: now,
        requiresVote: p.requiresVote,
        threshold: p.threshold,
        status: 'pending' as const,
      };
      return { ...state, motions: [...state.motions, motion] };
    }

    case 'motion/status': {
      const { motionId, status } = ev.payload;
      return {
        ...state,
        motions: state.motions.map((m) => (m.id === motionId ? { ...m, status } : m)),
      };
    }

    /* ---------------- 表决 ---------------- */
    case 'vote/open': {
      const p = ev.payload;
      return {
        ...state,
        phase: 'voting',
        activeVote: {
          id: `v-${now}`,
          subjectKind: p.subjectKind,
          subjectId: p.subjectId,
          titleZh: p.titleZh,
          mode: p.mode,
          ballots: {},
          openedAt: now,
          presentAtVote: p.presentAtVote,
        },
        motions: state.motions.map((m) =>
          m.id === p.subjectId ? { ...m, status: 'voting' as const } : m,
        ),
        documents: state.documents.map((d) =>
          d.id === p.subjectId ? { ...d, status: 'voting' as const } : d,
        ),
      };
    }

    case 'vote/cast': {
      if (!state.activeVote) return state;
      return {
        ...state,
        activeVote: {
          ...state.activeVote,
          ballots: { ...state.activeVote.ballots, [ev.payload.delegationId]: ev.payload.choice },
        },
      };
    }

    case 'vote/mode': {
      if (!state.activeVote) return state;
      return { ...state, activeVote: { ...state.activeVote, mode: ev.payload.mode } };
    }

    case 'vote/close': {
      const v = state.activeVote;
      if (!v) return state;
      const closed = {
        ...v,
        closedAt: now,
        result: ev.payload.result,
        vetoedBy: ev.payload.vetoedBy,
        counts: ev.payload.counts,
      };
      return {
        ...state,
        phase: state.phase === 'voting' ? 'debate' : state.phase,
        activeVote: null,
        votes: [...state.votes, closed],
        motions: state.motions.map((m) =>
          m.id === v.subjectId
            ? { ...m, status: ev.payload.result === 'passed' ? ('passed' as const) : ('failed' as const) }
            : m,
        ),
        documents: state.documents.map((d) =>
          d.id === v.subjectId
            ? {
                ...d,
                status: ev.payload.result === 'passed' ? ('passed' as const) : ('failed' as const),
              }
            : d,
        ),
      };
    }

    case 'vote/abort': {
      const v = state.activeVote;
      if (!v) return state;
      return {
        ...state,
        phase: state.phase === 'voting' ? 'debate' : state.phase,
        activeVote: null,
        // 被取消的表决仍留痕，便于复盘"这次没投成"
        votes: [...state.votes, { ...v, closedAt: now }],
        motions: state.motions.map((m) =>
          m.id === v.subjectId ? { ...m, status: 'pending' as const } : m,
        ),
        documents: state.documents.map((d) =>
          d.id === v.subjectId ? { ...d, status: 'introduced' as const } : d,
        ),
      };
    }

    /* ---------------- 文件流转 ---------------- */
    case 'doc/register': {
      const p = ev.payload;
      const code = nextDocCode(state.documents, p.kind);
      return {
        ...state,
        documents: [
          ...state.documents,
          {
            id: `doc-${now}-${state.documents.length + 1}`,
            kind: p.kind,
            code,
            titleZh: p.titleZh,
            sponsors: p.sponsors,
            signatories: p.signatories,
            parentId: p.parentId,
            registeredAt: now,
            status: 'introduced',
          },
        ],
      };
    }

    case 'doc/role': {
      const { docId, delegationId, role, action } = ev.payload;
      return {
        ...state,
        documents: state.documents.map((d) => {
          if (d.id !== docId) return d;
          if (role === 'sponsor') {
            const sponsors =
              action === 'add'
                ? d.sponsors.includes(delegationId)
                  ? d.sponsors
                  : [...d.sponsors, delegationId]
                : d.sponsors.filter((x) => x !== delegationId);
            // 起草国与附议国互斥
            const signatories =
              action === 'add' ? d.signatories.filter((x) => x !== delegationId) : d.signatories;
            return { ...d, sponsors, signatories };
          }
          const signatories =
            action === 'add'
              ? d.signatories.includes(delegationId)
                ? d.signatories
                : [...d.signatories, delegationId]
              : d.signatories.filter((x) => x !== delegationId);
          const sponsors =
            action === 'add' ? d.sponsors.filter((x) => x !== delegationId) : d.sponsors;
          return { ...d, sponsors, signatories };
        }),
      };
    }

    case 'doc/promote': {
      const { docId } = ev.payload;
      return {
        ...state,
        documents: state.documents.map((d) =>
          d.id === docId && d.kind === 'working_paper'
            ? { ...d, kind: 'draft_resolution', code: nextDocCode(state.documents, 'draft_resolution') }
            : d,
        ),
      };
    }

    case 'doc/status': {
      const { docId, status } = ev.payload;
      return {
        ...state,
        documents: state.documents.map((d) => (d.id === docId ? { ...d, status } : d)),
      };
    }

    default: {
      const never: never = ev;
      return never;
    }
  }
}

/** 回放：事件数组 → 场次状态。纯函数，可任意次数调用 */
export function replay(initial: SessionState, events: SessionEvent[]): SessionState {
  return events.reduce(reduce, initial);
}
