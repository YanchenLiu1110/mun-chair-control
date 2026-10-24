import { create } from 'zustand';
import { computeQuorum } from '../domain/derive';
import type { EventKind, EventPayloads, SessionEvent } from '../domain/events';
import { makeEvent } from '../domain/events';
import { createInitialState, reduce, replay } from '../domain/reducer';
import { getRuleset } from '../domain/rulesets';
import type { Committee, Delegation, Session, SessionMeta, SessionState, VoteMode } from '../domain/types';
import { tallyVote } from '../domain/voting';
import {
  clearAll,
  deleteLastEvents,
  deleteSessionEvents,
  kvGet,
  kvSet,
  loadAllEvents,
  loadEvents,
  putEvents,
} from './db';
import { onPeerHello, publish, publishReset } from './sync';

const KV_WORKSPACE = 'workspace/v1';

interface Workspace {
  committee: Committee;
  sessions: Session[];
  activeSessionId: string | null;
}

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function cnNum(n: number): string {
  return CN_NUM[n] ?? String(n);
}

function buildMeta(committee: Committee, session: Session): SessionMeta {
  return {
    sessionId: session.id,
    committeeId: committee.id,
    committeeNameZh: committee.nameZh,
    committeeNameEn: committee.nameEn,
    rulesetId: committee.rulesetId,
    label: session.label,
    ordinal: session.ordinal,
    status: 'idle',
  };
}

function initialStateFor(committee: Committee, session: Session): SessionState {
  const ruleset = getRuleset(committee.rulesetId);
  return createInitialState(buildMeta(committee, session), ruleset.defaultSpeechSec);
}

export interface CreateCommitteeInput {
  nameZh: string;
  nameEn: string;
  rulesetId: string;
  /** 名册由设置页决定，不再受固定国家数限制 */
  delegations: Delegation[];
}

interface SessionStore {
  ready: boolean;
  committee: Committee | null;
  sessions: Session[];
  activeSessionId: string | null;
  state: SessionState | null;
  events: SessionEvent[];

  init: () => Promise<void>;
  createCommittee: (input: CreateCommitteeInput) => Promise<void>;
  /** 调整名册。只允许在没有事件时改 —— 事件靠 delegationId 关联，中途删人会留下悬空引用 */
  updateRoster: (delegations: Delegation[]) => Promise<void>;
  startSession: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  closeSession: () => Promise<void>;
  /** 返回会期列表（不动数据，只是退出当前会期视图） */
  backToPicker: () => Promise<void>;
  /** 永久删除一个会期：事件流直接从库里抹掉，不进撤销栈 */
  deleteSession: (id: string) => Promise<void>;
  append: <K extends EventKind>(kind: K, payload: EventPayloads[K]) => Promise<void>;
  /** 开表决：顺手把当前出席人数写进快照，供 F4 出席率曲线使用 */
  openVote: (input: {
    subjectKind: 'motion' | 'document';
    subjectId: string;
    titleZh: string;
    mode: VoteMode;
  }) => Promise<void>;
  /** 关表决：结论在这里算一次并写进事件，之后回放不会再变 */
  closeVote: () => Promise<void>;
  undo: (steps?: number) => Promise<void>;
  exportJson: () => Promise<string>;
  resetAll: () => Promise<void>;
}

function persistWorkspace(w: Workspace): Promise<unknown> {
  return kvSet(KV_WORKSPACE, w);
}

/**
 * 清掉本应用写在 localStorage 里的偏好（话术库、阵营权重、雷达排序）。
 * 只按前缀删，不碰同一个域下别人的键。
 */
function clearLocalPrefs(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mun-chair/')) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* 隐私模式下 localStorage 可能直接抛错，重置不该因此中断 */
  }
}

export const useSession = create<SessionStore>()((set, get) => ({
  ready: false,
  committee: null,
  sessions: [],
  activeSessionId: null,
  state: null,
  events: [],

  init: async () => {
    const ws = await kvGet<Workspace>(KV_WORKSPACE);
    if (!ws) {
      set({ ready: true });
      // 主窗口应答投影窗口的补发请求
      onPeerHello(() => {
        const { committee, state } = get();
        if (committee && state) publish({ committee, state });
      });
      return;
    }

    let state: SessionState | null = null;
    let events: SessionEvent[] = [];
    const session = ws.sessions.find((s) => s.id === ws.activeSessionId) ?? null;

    if (session) {
      events = await loadEvents(session.id);
      state = replay(initialStateFor(ws.committee, session), events);
    }

    set({
      ready: true,
      committee: ws.committee,
      sessions: ws.sessions,
      activeSessionId: session?.id ?? null,
      state,
      events,
    });

    onPeerHello(() => {
      const { committee: c, state: s } = get();
      if (c && s) publish({ committee: c, state: s });
    });
  },

  createCommittee: async (input) => {
    const committee: Committee = {
      id: `c-${Date.now()}`,
      nameZh: input.nameZh,
      nameEn: input.nameEn,
      rulesetId: input.rulesetId,
      delegations: input.delegations,
      createdAt: Date.now(),
    };
    const ws: Workspace = { committee, sessions: [], activeSessionId: null };
    await persistWorkspace(ws);
    set({ committee, sessions: [], activeSessionId: null, state: null, events: [] });
  },

  updateRoster: async (delegations) => {
    const { committee, sessions, activeSessionId } = get();
    if (!committee) return;
    // 已经开过会期就只能加人、不能删人：历史事件按 delegationId 关联，删了会留下悬空引用
    if (sessions.length > 0) {
      const after = new Set(delegations.map((d) => d.id));
      const removed = committee.delegations.some((d) => !after.has(d.id));
      if (removed) return;
    }
    const next: Committee = { ...committee, delegations };
    const ws: Workspace = { committee: next, sessions, activeSessionId };
    await persistWorkspace(ws);
    set({ committee: next });
  },

  startSession: async () => {
    const { committee, sessions } = get();
    if (!committee) return;
    // 用「已有最大序号 + 1」而不是 length + 1：删掉中间某个会期之后，
    // length 会退回去，直接加一会造出「第二会期」重名。
    const ordinal = sessions.reduce((max, s) => Math.max(max, s.ordinal), 0) + 1;
    const session: Session = {
      id: `s-${Date.now()}`,
      committeeId: committee.id,
      ordinal,
      label: `第${cnNum(ordinal)}会期`,
      startedAt: Date.now(),
    };
    const nextSessions = [...sessions, session];
    await persistWorkspace({ committee, sessions: nextSessions, activeSessionId: session.id });

    const base = initialStateFor(committee, session);
    const ev = makeEvent(session.id, 1, 'session/opened', { label: session.label });
    const state = reduce(base, ev);
    await putEvents([ev]);

    set({ sessions: nextSessions, activeSessionId: session.id, state, events: [ev] });
    publish({ committee, state });
  },

  selectSession: async (id) => {
    const { committee, sessions } = get();
    if (!committee) return;
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    await persistWorkspace({ committee, sessions, activeSessionId: id });
    const events = await loadEvents(id);
    const state = replay(initialStateFor(committee, session), events);
    set({ activeSessionId: id, state, events });
    publish({ committee, state });
  },

  closeSession: async () => {
    const { sessions, activeSessionId, committee } = get();
    await get().append('session/closed', {});
    // 会期记录上补一个结束时间，会期列表据此显示「已结束」
    if (!committee || !activeSessionId) return;
    const nextSessions = sessions.map((s) =>
      s.id === activeSessionId ? { ...s, endedAt: Date.now() } : s,
    );
    await persistWorkspace({ committee, sessions: nextSessions, activeSessionId });
    set({ sessions: nextSessions });
  },

  /** 回到会期列表：清掉当前会期的内存状态，但事件已经落库，随时可以再打开 */
  backToPicker: async () => {
    const { committee, sessions } = get();
    if (!committee) return;
    await persistWorkspace({ committee, sessions, activeSessionId: null });
    set({ activeSessionId: null, state: null, events: [] });
  },

  /**
   * 永久删除一个会期。和「休会」是两回事：
   * 休会只是标记结束、记录留着；删除是把这场的事件流从库里抹掉，撤销也回不来。
   */
  deleteSession: async (id) => {
    const { committee, sessions, activeSessionId } = get();
    if (!committee) return;
    if (!sessions.some((s) => s.id === id)) return;

    await deleteSessionEvents(id);
    const nextSessions = sessions.filter((s) => s.id !== id);
    const wasActive = activeSessionId === id;
    await persistWorkspace({
      committee,
      sessions: nextSessions,
      activeSessionId: wasActive ? null : activeSessionId,
    });

    if (wasActive) {
      set({ sessions: nextSessions, activeSessionId: null, state: null, events: [] });
      // 大屏不能停在被删掉的那一帧上
      publishReset();
    } else {
      set({ sessions: nextSessions });
    }
  },

  append: async (kind, payload) => {
    const { activeSessionId, events, state, committee } = get();
    if (!activeSessionId || !state || !committee) return;

    const lastSeq = events.length > 0 ? events[events.length - 1].seq : 0;
    const ev = makeEvent(activeSessionId, lastSeq + 1, kind, payload);
    const nextEvents = [...events, ev];
    const nextState = reduce(state, ev);

    // 先更新内存（界面立刻响应），再落盘
    set({ events: nextEvents, state: nextState });
    publish({ committee, state: nextState });

    try {
      await putEvents([ev]);
    } catch (err) {
      console.error('[mun-chair] 事件落盘失败', err);
    }
  },

  openVote: async (input) => {
    const { state, committee } = get();
    if (!state || !committee) return;
    const ruleset = getRuleset(committee.rulesetId);
    const quorum = computeQuorum(state, committee.delegations, ruleset);
    await get().append('vote/open', { ...input, presentAtVote: quorum.present });
  },

  closeVote: async () => {
    const { state, committee } = get();
    if (!state || !committee || !state.activeVote) return;
    const tally = tallyVote(state.activeVote, committee.delegations);
    await get().append('vote/close', {
      result: tally.passed ? 'passed' : 'failed',
      vetoedBy: tally.vetoedBy.map((d) => d.id),
      counts: { yes: tally.yes, no: tally.no, abstain: tally.abstain, pass: tally.pass },
    });
  },

  undo: async (steps = 1) => {
    const { activeSessionId, events, committee, sessions } = get();
    if (!activeSessionId || !committee) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;

    const n = Math.min(steps, events.length);
    if (n === 0) return;

    const remaining = events.slice(0, events.length - n);
    const nextState = replay(initialStateFor(committee, session), remaining);

    set({ events: remaining, state: nextState });
    publish({ committee, state: nextState });

    try {
      await deleteLastEvents(activeSessionId, n);
    } catch (err) {
      console.error('[mun-chair] 撤销落盘失败', err);
    }
  },

  exportJson: async () => {
    const { committee, sessions } = get();
    const all = await loadAllEvents();
    return JSON.stringify(
      {
        format: 'mun-chair/v1',
        exportedAt: new Date().toISOString(),
        committee,
        sessions,
        events: all,
      },
      null,
      2,
    );
  },

  resetAll: async () => {
    await clearAll();
    // 只清 IndexedDB 是不够的：话术库、阵营权重、雷达排序都在 localStorage，
    // 不一起清掉就会出现「重置完还是上次那套参数」的怪现象。
    clearLocalPrefs();
    publishReset();
    set({ committee: null, sessions: [], activeSessionId: null, state: null, events: [] });
  },
}));
