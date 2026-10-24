import type { QuorumInfo } from './derive';
import { remainingNow } from './timer';
import type { SessionState } from './types';

/**
 * F2 · 主席提词器（Chair Script）
 *
 * 状态机只负责一件事：把「当前会议状态」压成一个 key。
 * 话术库是 key → 台词数组，可编辑可扩展，存 localStorage。
 * 新增一种场景 = 加一个 key + 一条默认台词，不需要改界面。
 */

export type ScriptKey =
  | 'idle'
  | 'rollcall'
  | 'quorum_fail'
  | 'agenda'
  | 'gsl_no_speaker'
  | 'gsl_speaking'
  | 'gsl_next'
  | 'timer_warning'
  | 'timer_expired'
  | 'caucus_moderated'
  | 'caucus_unmoderated'
  | 'caucus_warning'
  | 'caucus_expired'
  | 'motion_pending'
  | 'voting_open'
  | 'voting_closing'
  | 'vote_passed'
  | 'vote_failed'
  | 'vote_vetoed'
  | 'doc_registered'
  | 'closed';

export interface ScriptEntry {
  id: string;
  zh: string;
  en: string;
}

export type ScriptLibrary = Record<ScriptKey, ScriptEntry[]>;

export const SCRIPT_KEY_LABEL: Record<ScriptKey, string> = {
  idle: '未开场',
  rollcall: '点名中',
  quorum_fail: '法定人数不足',
  agenda: '设定议题',
  gsl_no_speaker: '无人发言 / 名单为空',
  gsl_speaking: '正式辩论进行中',
  gsl_next: '名单即将结束',
  timer_warning: '发言剩余 30 秒',
  timer_expired: '发言时间到',
  caucus_moderated: '有主持核心磋商',
  caucus_unmoderated: '自由磋商',
  caucus_warning: '磋商剩余 30 秒',
  caucus_expired: '磋商结束',
  motion_pending: '有动议待处理',
  voting_open: '进入投票程序',
  voting_closing: '投票即将结束',
  vote_passed: '表决通过',
  vote_failed: '表决未通过',
  vote_vetoed: '遭五常否决',
  doc_registered: '有文件待介绍',
  closed: '已休会',
};

export const SCRIPT_KEY_ORDER: ScriptKey[] = [
  'idle',
  'rollcall',
  'quorum_fail',
  'agenda',
  'gsl_no_speaker',
  'gsl_speaking',
  'gsl_next',
  'timer_warning',
  'timer_expired',
  'caucus_moderated',
  'caucus_unmoderated',
  'caucus_warning',
  'caucus_expired',
  'motion_pending',
  'voting_open',
  'voting_closing',
  'vote_passed',
  'vote_failed',
  'vote_vetoed',
  'doc_registered',
  'closed',
];

const e = (id: string, zh: string, en: string): ScriptEntry => ({ id, zh, en });

export const DEFAULT_SCRIPTS: ScriptLibrary = {
  idle: [
    e('idle-1', '本场会议尚未开始。请各位代表就座，主席团即将开始点名。', 'The session has not yet begun. Delegates are kindly requested to take their seats; the dais will begin roll call shortly.'),
  ],
  rollcall: [
    e('rc-1', '现在开始点名。被点到的代表请高举国家牌，并回答「出席」或「出席并投票」。', 'We will now proceed to roll call. Delegates are kindly requested to raise their placards and state "present" or "present and voting".'),
  ],
  quorum_fail: [
    e('qf-1', '出席人数尚未达到法定人数，本委员会暂不能进入实质议程。请主席团继续等待代表到场。', 'Quorum has not yet been met. The committee cannot proceed to substantive business until quorum is established.'),
  ],
  agenda: [
    e('ag-1', '本场议题已确认。请各代表围绕议题发表初步立场。', 'The agenda has been set. Delegates are invited to deliver their preliminary positions on the topic.'),
  ],
  gsl_no_speaker: [
    e('gn-1', '主发言名单目前为空。有意发言的代表请高举国家牌，主席团将按举牌顺序记录。', 'The General Speakers\' List is currently empty. Delegates wishing to speak are kindly requested to raise their placards.'),
  ],
  gsl_speaking: [
    e('gs-1', '请下一位代表做好准备。发言时间结束时，主席团将予以提示。', 'The next delegate is kindly requested to prepare. The dais will signal when speaking time has elapsed.'),
  ],
  gsl_next: [
    e('gx-1', '主发言名单已接近尾声。是否有代表动议延长辩论，或动议结束辩论并进入投票？', 'The General Speakers\' List is nearing its end. Are there any motions to extend debate, or to close debate and move into voting procedure?'),
  ],
  timer_warning: [
    e('tw-1', '剩余时间三十秒。', 'Thirty seconds remain.'),
  ],
  timer_expired: [
    e('te-1', '发言时间已到，请代表停止发言，谢谢配合。', 'Speaking time has elapsed. The delegate is kindly requested to conclude.'),
  ],
  caucus_moderated: [
    e('cm-1', '本场有主持核心磋商现在开始，每位代表发言时间为一分钟。请有意发言的代表举牌。', 'The moderated caucus is now in order. Speaking time is one minute per delegate. Delegates wishing to speak are kindly requested to raise their placards.'),
  ],
  caucus_unmoderated: [
    e('cu-1', '自由磋商现在开始。请各位代表在会场内自由讨论，注意保持秩序。', 'The unmoderated caucus is now in order. Delegates may move freely about the room; decorum is kindly requested.'),
  ],
  caucus_warning: [
    e('cw-1', '磋商剩余三十秒，请各位代表准备回到座位。', 'Thirty seconds remain in the caucus. Delegates are kindly requested to return to their seats.'),
  ],
  caucus_expired: [
    e('ce-1', '磋商时间已结束，请各位代表回到座位，会议继续进行。', 'The caucus has concluded. Delegates are kindly requested to return to their seats and the meeting will resume.'),
  ],
  motion_pending: [
    e('mp-1', '有代表提出动议。请问是否有附议？若无异议，本动议直接通过。', 'A motion has been raised. Is there a second? If there is no objection, the motion shall be adopted by acclamation.'),
  ],
  voting_open: [
    e('vo-1', '本委员会现在进入投票程序。请关闭所有电子设备，投票期间代表不得出入会场。', 'The committee is now in voting procedure. All electronic devices shall be switched off; no delegate may enter or leave the room during voting.'),
    e('vo-2', '请未被点到名的代表保持安静。表决结果将由主席团公布。', 'Delegates not called upon are kindly requested to remain silent. The result will be announced by the dais.'),
  ],
  voting_closing: [
    e('vc-1', '投票即将结束，请尚未表决的代表尽快完成投票。', 'Voting is about to close. Delegates who have not yet voted are kindly requested to do so promptly.'),
  ],
  vote_passed: [
    e('vp-1', '本动议获得通过。', 'The motion carries.'),
  ],
  vote_failed: [
    e('vf-1', '本动议未获通过。会议继续。', 'The motion fails. The meeting shall proceed.'),
  ],
  vote_vetoed: [
    e('vv-1', '该决议草案因常任理事国投反对票而未获通过。', 'The draft resolution is not adopted owing to the negative vote of a permanent member of the Security Council.'),
  ],
  doc_registered: [
    e('dr-1', '主席团已收到文件，正在分发。请起草国代表简要介绍文件内容。', 'The dais has received the document, which is being distributed. The sponsor is kindly requested to brief the committee.'),
  ],
  closed: [
    e('cl-1', '本场会议结束。感谢各位代表的参与，祝各位会期顺利。', 'This session is hereby adjourned. Thank you, delegates.'),
  ],
};

const STORAGE_KEY = 'mun-chair/scripts/v1';

export function loadScripts(): ScriptLibrary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SCRIPTS;
    const saved = JSON.parse(raw) as Partial<ScriptLibrary>;
    // 与默认库合并：新增的 key 自动补上，用户改过的保留
    const merged = { ...DEFAULT_SCRIPTS } as ScriptLibrary;
    for (const key of SCRIPT_KEY_ORDER) {
      const list = saved[key];
      if (Array.isArray(list) && list.length > 0) merged[key] = list;
    }
    return merged;
  } catch {
    return DEFAULT_SCRIPTS;
  }
}

export function saveScripts(lib: ScriptLibrary): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
}

export function resetScripts(): ScriptLibrary {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return DEFAULT_SCRIPTS;
}

/* ==========================================================================
 * 状态 → 话术 key
 * ========================================================================== */

const RECENT_VOTE_MS = 15_000;

export function deriveScriptKey(
  state: SessionState,
  quorum: QuorumInfo | null,
  warningSec: number,
  now: number,
): ScriptKey {
  if (state.meta.status === 'closed' || state.phase === 'closed') return 'closed';

  // 刚公布的表决结果优先播报 15 秒
  const lastVote = state.votes[state.votes.length - 1];
  if (lastVote?.closedAt && now - lastVote.closedAt < RECENT_VOTE_MS) {
    if (lastVote.vetoedBy && lastVote.vetoedBy.length > 0) return 'vote_vetoed';
    return lastVote.result === 'passed' ? 'vote_passed' : 'vote_failed';
  }

  if (state.activeVote) {
    const cast = Object.keys(state.activeVote.ballots).length;
    const present = state.activeVote.presentAtVote ?? 0;
    return present > 0 && cast >= present * 0.85 ? 'voting_closing' : 'voting_open';
  }

  if (state.moderation.kind) {
    const left = remainingNow(state.moderation.totalTimer, now);
    if (left <= 0) return 'caucus_expired';
    if (left <= 30_000) return 'caucus_warning';
    return state.moderation.kind === 'moderated' ? 'caucus_moderated' : 'caucus_unmoderated';
  }

  const pending = state.motions.filter((m) => m.status === 'pending');
  if (pending.length > 0) return 'motion_pending';

  const floorLeft = remainingNow(state.floor.timer, now);
  if (state.floor.timer.status !== 'idle') {
    if (floorLeft <= 0) return 'timer_expired';
    if (floorLeft <= warningSec * 1000) return 'timer_warning';
  }

  if (state.phase === 'idle') return 'idle';
  if (state.phase === 'rollcall') {
    return quorum && !quorum.quorumMet ? 'quorum_fail' : 'rollcall';
  }
  if (state.phase === 'agenda') return 'agenda';

  if (state.gsl.order.length === 0) return 'gsl_no_speaker';
  if (state.gsl.currentIndex + 1 >= state.gsl.order.length) return 'gsl_next';
  return state.floor.speakingId ? 'gsl_speaking' : 'gsl_no_speaker';
}
