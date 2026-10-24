/**
 * 领域类型定义 —— 全项目的唯一契约。
 *
 * 设计原则：
 * 1. 所有字段可 JSON 序列化（事件流要落 IndexedDB、要广播给投影窗口）。
 * 2. 时间一律用 epoch 毫秒（number），不用 Date 对象。
 * 3. 计时器只存"意图 + 基准点"，不存每秒 tick —— 见 TimerState。
 */

/* ==========================================================================
 * 0. 基础标识
 * ========================================================================== */

export type ID = string;
export type DelegationId = ID;

/* ==========================================================================
 * 1. 名册：代表 / 委员会 / 场次
 * ========================================================================== */

/** 一个国家代表团。跨场次稳定不变，是 F1 图谱的节点、F3 雷达的行。 */
export interface Delegation {
  id: DelegationId;
  nameZh: string;
  nameEn: string;
  /** 短名，用于图谱节点与雷达窄栏，如「中国」 */
  shortZh: string;
  /** emoji 国旗，零资源依赖 */
  flag: string;
  /** 安理会五常 —— 否决权模式只看这个标记 */
  isP5: boolean;
  /** 人工标注阵营（可选）。仅作图谱初始聚类参考，不参与权重计算 */
  bloc?: string;
}

/** 委员会：一个工作区只有一个（已确认「单委员会多场次」） */
export interface Committee {
  id: ID;
  nameZh: string;
  nameEn: string;
  /** 该委员会使用的议事规则集 */
  rulesetId: string;
  delegations: Delegation[];
  createdAt: number;
}

/** 会期：同一委员会的第一次/第二次会期，事件流按会期分片 */
export interface Session {
  id: ID;
  committeeId: ID;
  ordinal: number;
  label: string;
  startedAt: number;
  endedAt?: number;
}

/* ==========================================================================
 * 2. 点名
 * ========================================================================== */

export type AttendanceStatus = 'present' | 'present_voting' | 'absent';

/* ==========================================================================
 * 3. 计时器（关键设计）
 *
 * 计时器是全场唯一的高频变化状态，绝不逐秒写事件。
 * 事件只记录「开始 / 暂停 / 继续 / 加时 / 重置 / 归零」这些"意图"，
 * 剩余时间由 (remainingMs, startedAt, now) 三者纯函数推导。
 * 好处：事件流体积恒定；投影窗口自己算倒计时，不需要每秒广播；
 *      刷新页面 / 换设备后时间轴完全一致。
 * ========================================================================== */

export type TimerStatus = 'idle' | 'running' | 'paused' | 'expired';

/**
 * 计时器寻址：场次里同时存在三个互不干扰的计时器。
 * 事件只带 target，不复制三套事件名。
 */
export type TimerTarget = 'floor' | 'caucus_speaker' | 'caucus_total';

export interface TimerState {
  /** 本轮设定时长（加时前），用于重置 */
  durationMs: number;
  /** 基准剩余：running 时表示 startedAt 那一刻的剩余；否则表示当前剩余 */
  remainingMs: number;
  status: TimerStatus;
  /** epoch ms，仅 running 时有值 */
  startedAt: number | null;
  /** 累计加时毫秒，用于纪要 */
  extendedMs: number;
}

/** 讲台来源：主发言名单 / 有主持磋商 / 自由磋商 / 临时 */
export type SpeakerSource = 'gsl' | 'moderated' | 'unmoderated' | 'ad_hoc' | 'none';

/* ==========================================================================
 * 4. 让渡
 * ========================================================================== */

export type YieldTarget = 'chair' | 'delegate' | 'questions' | 'comments';

export interface YieldRecord {
  target: YieldTarget;
  /** target === 'delegate' 时的接收方 */
  toDelegationId?: DelegationId;
  note?: string;
  at: number;
}

/* ==========================================================================
 * 5. 讲台与名单
 * ========================================================================== */

export interface FloorState {
  speakingId: DelegationId | null;
  source: SpeakerSource;
  timer: TimerState;
  yield: YieldRecord | null;
  /** 禁止二次让渡：本场发言已让渡过就不能再让 */
  yieldUsed: boolean;
}

export interface GslState {
  /** 名单顺序，同一代表不可重复（由 reducer 保证） */
  order: DelegationId[];
  /** 当前正在发言者的下标；-1 表示尚未开始 */
  currentIndex: number;
}

/* ==========================================================================
 * 6. 磋商（Stage 2 启用，类型先定死避免后期改 schema）
 * ========================================================================== */

export type CaucusKind = 'moderated' | 'unmoderated';

export interface ModerationState {
  kind: CaucusKind | null;
  topicZh: string;
  /** 总时长（秒） */
  totalSec: number;
  /** 单人时长（秒），仅 moderated 有效 */
  perSpeakerSec: number;
  /** 有主持磋商的独立发言队列 */
  queue: DelegationId[];
  currentSpeaker: DelegationId | null;
  /** 单人计时 */
  timer: TimerState;
  /** 磋商总时长计时 */
  totalTimer: TimerState;
}

/* ==========================================================================
 * 7. 动议 / 投票 / 文件（Stage 2-3 填充）
 * ========================================================================== */

export type MotionCategory = 'substantive' | 'procedural' | 'inquiry' | 'privilege';

export interface Motion {
  id: ID;
  typeId: string;
  /** 快照：提出时的类型名与门槛，避免规则集调整后历史记录变形 */
  typeNameZh: string;
  category: MotionCategory;
  proposerId: DelegationId | null;
  topicZh: string;
  totalSec: number;
  perSpeakerSec: number;
  proposedAt: number;
  requiresVote: boolean;
  threshold: ThresholdKind;
  /** pending -> voting -> passed / failed / withdrawn；问题类由主席裁定 -> ruled */
  status: 'pending' | 'voting' | 'passed' | 'failed' | 'withdrawn' | 'ruled';
}

export type VoteChoice = 'yes' | 'no' | 'abstain' | 'pass';

export type VoteMode = 'simple' | 'two_thirds' | 'veto';

/** 关闭表决时的计票快照，写进事件后历史结论不再随规则变动 */
export interface VoteCounts {
  yes: number;
  no: number;
  abstain: number;
  pass: number;
}

export interface VoteRecord {
  id: ID;
  /** 表决对象：动议 / 决议草案 / 修正案 */
  subjectKind: 'motion' | 'document';
  subjectId: ID;
  titleZh: string;
  mode: VoteMode;
  /** delegationId -> 选择 */
  ballots: Record<DelegationId, VoteChoice>;
  openedAt: number;
  closedAt?: number;
  result?: 'passed' | 'failed';
  /** 否决方（P5） */
  vetoedBy?: DelegationId[];
  /** 关闭时的计票快照 */
  counts?: VoteCounts;
  /** 该次投票时的出席人数快照 —— F4 出席率曲线的数据源 */
  presentAtVote?: number;
}

export type DocumentKind = 'working_paper' | 'draft_resolution' | 'amendment';

export interface DocumentRecord {
  id: ID;
  kind: DocumentKind;
  code: string;
  titleZh: string;
  sponsors: DelegationId[];
  signatories: DelegationId[];
  parentId?: ID;
  registeredAt: number;
  status: 'drafting' | 'introduced' | 'voting' | 'passed' | 'failed';
}

/* ==========================================================================
 * 8. 会议层状态机
 *
 * 与计时器状态机正交：
 *   MeetingPhase 管「现在该干什么」→ 驱动 F2 提词器
 *   TimerStatus  管「还剩几秒」    → 驱动投影视图
 * ========================================================================== */

export type MeetingPhase =
  | 'idle' // 未开场
  | 'rollcall' // 点名中
  | 'agenda' // 设定议题
  | 'debate' // 正式辩论（主发言名单）
  | 'moderated' // 有主持核心磋商
  | 'unmoderated' // 自由磋商
  | 'voting' // 投票程序
  | 'closed'; // 休会

/* ==========================================================================
 * 9. 场次状态（由事件流折叠得到，不是被"修改"的对象）
 * ========================================================================== */

export interface SessionMeta {
  sessionId: ID;
  committeeId: ID;
  committeeNameZh: string;
  committeeNameEn: string;
  rulesetId: string;
  label: string;
  ordinal: number;
  status: 'idle' | 'open' | 'closed';
  openedAt?: number;
  closedAt?: number;
}

export interface AgendaItem {
  topicZh: string;
  topicEn: string;
}

export interface SessionState {
  meta: SessionMeta;
  phase: MeetingPhase;
  agenda: AgendaItem | null;
  attendance: Record<DelegationId, AttendanceStatus>;
  gsl: GslState;
  floor: FloorState;
  moderation: ModerationState;
  motions: Motion[];
  /** 进行中的表决；关闭后移入 votes[] */
  activeVote: VoteRecord | null;
  votes: VoteRecord[];
  documents: DocumentRecord[];
}

/* ==========================================================================
 * 10. 规则集（可配置 —— 已确认）
 * ========================================================================== */

export type ThresholdKind = 'simple' | 'two_thirds' | 'none';

export interface MotionTypeDef {
  id: string;
  nameZh: string;
  nameEn: string;
  category: MotionCategory;
  /** false = 主席直接裁定，不表决（如程序性问题） */
  requiresVote: boolean;
  threshold: ThresholdKind;
  /** 可辩论动议：表决前需要正反方发言 */
  debatable: boolean;
  defaultTotalSec?: number;
  defaultPerSpeakerSec?: number;
}

export interface Ruleset {
  id: string;
  nameZh: string;
  nameEn: string;
  /** 法定人数 = ceil(总代表数 × 该比例) */
  quorumRatio: number;
  /** 简单多数 / 三分之二多数的计算基数 */
  majorityBasis: 'present' | 'present_voting';
  /** 动议通过所需赞成比例（如 0.5 / 0.6667） */
  motionPassRatio: number;
  /** 五常否决权 */
  vetoEnabled: boolean;
  defaultSpeechSec: number;
  /** 剩余 N 秒提示音 */
  warningSec: number;
  /** 动议门槛占出席比例（用于 20% 门槛提示） */
  motionThresholdRatio: number;
  motionTypes: MotionTypeDef[];
  caucus: {
    moderatedMaxTotalSec: number;
    moderatedMaxPerSpeakerSec: number;
    unmoderatedMaxTotalSec: number;
  };
}
