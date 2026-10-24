import type {
  AttendanceStatus,
  DocumentKind,
  DocumentRecord,
  ID,
  MeetingPhase,
  Motion,
  MotionCategory,
  ThresholdKind,
  TimerTarget,
  VoteChoice,
  VoteMode,
  YieldTarget,
} from './types';

type Empty = Record<string, never>;

/**
 * 事件负载表。
 *
 * 新增一种操作 = 在这里加一行 + 在 reducer 里加一个 case，
 * 其余层（存储、广播、撤销、纪要、会诊报告）自动兼容。
 */
export interface EventPayloads {
  /* 会议生命周期 */
  'session/opened': { label: string };
  'session/closed': Empty;
  'agenda/set': { topicZh: string; topicEn: string };
  'phase/set': { phase: MeetingPhase };

  /* 点名 */
  'rollcall/marked': { delegationId: ID; status: AttendanceStatus };
  'rollcall/markAll': { status: AttendanceStatus; delegationIds: ID[] };
  'rollcall/reset': Empty;

  /* 主发言名单 */
  'gsl/add': { delegationId: ID };
  'gsl/remove': { delegationId: ID };
  'gsl/move': { from: number; to: number };
  'gsl/clear': Empty;
  /** 让名单下一位上台，同时启动发言计时 */
  'gsl/advance': { durationSec: number; delegationId?: ID };

  /* 计时（target 缺省 = floor，兼容早期事件） */
  'timer/start': { durationSec: number; speakerId: ID | null; target?: TimerTarget };
  'timer/pause': { target?: TimerTarget };
  'timer/resume': { target?: TimerTarget };
  'timer/reset': { target?: TimerTarget };
  'timer/extend': { addSec: number; target?: TimerTarget };
  'timer/expire': { target?: TimerTarget };

  /* 让渡 */
  'yield/set': { target: YieldTarget; toDelegationId?: ID; note?: string };
  'yield/clear': Empty;

  /* 磋商 */
  'caucus/open': {
    kind: 'moderated' | 'unmoderated';
    topicZh: string;
    totalSec: number;
    perSpeakerSec: number;
  };
  'caucus/close': Empty;
  'caucus/enqueue': { delegationId: ID };
  'caucus/dequeue': { delegationId: ID };
  /** 队列头上台，启动单人计时 */
  'caucus/next': { delegationId?: ID; perSpeakerSec?: number };

  /* 动议与问题 */
  'motion/propose': {
    typeId: string;
    typeNameZh: string;
    category: MotionCategory;
    proposerId: ID | null;
    topicZh: string;
    totalSec: number;
    perSpeakerSec: number;
    requiresVote: boolean;
    threshold: ThresholdKind;
  };
  'motion/status': { motionId: ID; status: Motion['status'] };

  /* 表决 */
  'vote/open': {
    subjectKind: 'motion' | 'document';
    subjectId: ID;
    titleZh: string;
    mode: VoteMode;
    presentAtVote: number;
  };
  'vote/cast': { delegationId: ID; choice: VoteChoice };
  /** 表决模式可中途切换（简单 / 2:3 / 五常否决） */
  'vote/mode': { mode: VoteMode };
  /** result 在关闭时由 tallyVote 算出并写入事件，保证历史结论不随规则调整而变 */
  'vote/close': {
    result: 'passed' | 'failed';
    vetoedBy: ID[];
    counts: { yes: number; no: number; abstain: number; pass: number };
  };
  'vote/abort': Empty;

  /* 文件流转 */
  'doc/register': {
    kind: DocumentKind;
    titleZh: string;
    sponsors: ID[];
    signatories: ID[];
    parentId?: ID;
  };
  /** 起草国与附议国互斥：加入一方会从另一方移除 */
  'doc/role': {
    docId: ID;
    delegationId: ID;
    role: 'sponsor' | 'signatory';
    action: 'add' | 'remove';
  };
  /** 工作文件 → 决议草案，保留 id，重新分配 DR 编号 */
  'doc/promote': { docId: ID };
  'doc/status': { docId: ID; status: DocumentRecord['status'] };
}

export type EventKind = keyof EventPayloads;

interface EventBase {
  /** 主键 `${sessionId}:${seq}`，与 IndexedDB 复合键一致 */
  key: string;
  sessionId: ID;
  /** 场次内严格递增，撤销 = 截断尾部 */
  seq: number;
  ts: number;
}

/** 判别联合：按 kind 收窄 payload 类型 */
export type SessionEvent = {
  [K in EventKind]: EventBase & { kind: K; payload: EventPayloads[K] };
}[EventKind];

export function makeEvent<K extends EventKind>(
  sessionId: ID,
  seq: number,
  kind: K,
  payload: EventPayloads[K],
  ts = Date.now(),
): SessionEvent {
  return {
    key: `${sessionId}:${String(seq).padStart(8, '0')}`,
    sessionId,
    seq,
    ts,
    kind,
    payload,
  } as SessionEvent;
}

/** 事件的中文标签，供时间轴 / 纪要 / 撤销提示复用 */
export const EVENT_LABELS: Record<EventKind, string> = {
  'session/opened': '会议开始',
  'session/closed': '会议结束',
  'agenda/set': '设定议题',
  'phase/set': '切换会议阶段',
  'rollcall/marked': '点名标记',
  'rollcall/markAll': '批量点名',
  'rollcall/reset': '重置点名',
  'gsl/add': '加入主发言名单',
  'gsl/remove': '移出主发言名单',
  'gsl/move': '调整发言顺序',
  'gsl/clear': '清空主发言名单',
  'gsl/advance': '切换发言国',
  'timer/start': '开始计时',
  'timer/pause': '暂停计时',
  'timer/resume': '继续计时',
  'timer/reset': '重置计时',
  'timer/extend': '加时',
  'timer/expire': '计时归零',
  'yield/set': '让渡时间',
  'yield/clear': '取消让渡',
  'caucus/open': '开启磋商',
  'caucus/close': '结束磋商',
  'caucus/enqueue': '加入磋商队列',
  'caucus/dequeue': '移出磋商队列',
  'caucus/next': '磋商下一位发言',
  'motion/propose': '提出动议',
  'motion/status': '动议状态变更',
  'vote/open': '开始表决',
  'vote/cast': '投票',
  'vote/mode': '切换表决模式',
  'vote/close': '公布表决结果',
  'vote/abort': '取消表决',
  'doc/register': '登记文件',
  'doc/role': '调整起草/附议',
  'doc/promote': '升级为决议草案',
  'doc/status': '文件状态变更',
};
