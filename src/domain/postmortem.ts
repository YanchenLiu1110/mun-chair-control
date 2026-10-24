import type { SessionEvent } from './events';
import { computeParticipation } from './participation';
import type { Delegation, MeetingPhase, MotionCategory, SessionState } from './types';

/**
 * F4 · 会后复盘
 *
 * 全部指标从事件流推导，与 F3 同源 —— 撤销、刷新、回放后统计自动一致。
 * 这里只做纯计算，不碰任何渲染；报告 SVG 与导出都消费同一份 PostMortem。
 */

/* ---------------------------------------------------------------- *
 * 1. 时间分配（Sankey 的数据源）
 * ---------------------------------------------------------------- */

export type TimeBucket = 'formal' | 'moderated' | 'unmoderated' | 'voting' | 'other';

export const TIME_BUCKET_LABEL: Record<TimeBucket, string> = {
  formal: '正式辩论',
  moderated: '有主持磋商',
  unmoderated: '自由磋商',
  voting: '表决程序',
  other: '点名 / 其他',
};

export const TIME_BUCKET_HINT: Record<TimeBucket, string> = {
  formal: '主发言名单',
  moderated: '设定议题与单人限时',
  unmoderated: '自由走动磋商',
  voting: '点名投票与计票',
  other: '开场、点名、休会',
};

export interface TimeSlice {
  bucket: TimeBucket;
  ms: number;
  share: number;
}

export interface TimeAllocation {
  totalMs: number;
  slices: TimeSlice[];
  /** 超长片段被截断的总时长（多半是主席忘了关计时，把休息算进去了） */
  trimmedMs: number;
  /** 单段上限，用于报告脚注 */
  capMs: number;
}

/** 单段超过 30 分钟、且期间没有任何操作记录，按 30 分钟计 —— 那多半是茶歇或忘关计时 */
const SEGMENT_CAP_MS = 30 * 60 * 1000;

const PHASE_BUCKET: Record<MeetingPhase, TimeBucket> = {
  idle: 'other',
  rollcall: 'other',
  agenda: 'other',
  debate: 'formal',
  moderated: 'moderated',
  unmoderated: 'unmoderated',
  voting: 'voting',
  closed: 'other',
};

/** 只有这些事件会改变"当前在干什么"，其余事件不切分时间段 */
function bucketAfter(ev: SessionEvent, prev: TimeBucket): TimeBucket {
  switch (ev.kind) {
    case 'session/opened':
      return 'other';
    case 'session/closed':
      return 'other';
    case 'phase/set':
      return PHASE_BUCKET[ev.payload.phase];
    case 'caucus/open':
      return ev.payload.kind === 'moderated' ? 'moderated' : 'unmoderated';
    case 'caucus/close':
      return 'formal';
    case 'vote/open':
      return 'voting';
    case 'vote/close':
    case 'vote/abort':
      return 'formal';
    default:
      return prev;
  }
}

/** 这些事件只是"切换状态"的标记，不算这段时间里发生过实际动作 */
const MODE_KINDS = new Set<string>([
  'session/opened',
  'session/closed',
  'phase/set',
  'caucus/open',
  'caucus/close',
  'vote/open',
  'vote/close',
  'vote/abort',
]);

export function computeTimeAllocation(events: SessionEvent[]): TimeAllocation {
  const buckets: Record<TimeBucket, number> = {
    formal: 0,
    moderated: 0,
    unmoderated: 0,
    voting: 0,
    other: 0,
  };

  if (events.length === 0) {
    return { totalMs: 0, slices: [], trimmedMs: 0, capMs: SEGMENT_CAP_MS };
  }

  const startAt = events[0].ts;
  const endAt = Math.max(events[events.length - 1].ts, startAt);

  let current: TimeBucket = 'other';
  let cursor = startAt;
  let trimmedMs = 0;
  /** 当前时间段内发生过的操作数：为 0 才说明这段时间是空转 */
  let actsInSegment = 0;

  const flush = (to: number) => {
    const raw = Math.max(0, to - cursor);
    if (raw <= 0) return;
    // 只有"零操作"的超长片段才封顶：连续 60 分钟、期间有几十条发言记录的辩论不该被砍
    if (raw > SEGMENT_CAP_MS && actsInSegment === 0) {
      trimmedMs += raw - SEGMENT_CAP_MS;
      buckets[current] += SEGMENT_CAP_MS;
    } else {
      buckets[current] += raw;
    }
    cursor = to;
    actsInSegment = 0;
  };

  for (const ev of events) {
    const next = bucketAfter(ev, current);
    if (next !== current) {
      flush(ev.ts);
      current = next;
    }
    if (!MODE_KINDS.has(ev.kind)) actsInSegment += 1;
    // 注意：这里不能推进 cursor —— cursor 是"当前时间段起点"，
    // 一旦在未切换时间段的事件上推进，中间流逝的时间就会被静默丢掉。
  }
  flush(endAt);

  const totalMs = (Object.values(buckets) as number[]).reduce((a, b) => a + b, 0);
  const order: TimeBucket[] = ['formal', 'moderated', 'unmoderated', 'voting', 'other'];
  const slices = order
    .filter((b) => buckets[b] > 0)
    .map((b) => ({ bucket: b, ms: buckets[b], share: totalMs > 0 ? buckets[b] / totalMs : 0 }));

  return { totalMs, slices, trimmedMs, capMs: SEGMENT_CAP_MS };
}

/* ---------------------------------------------------------------- *
 * 2. 动议统计
 * ---------------------------------------------------------------- */

export const MOTION_CATEGORY_LABEL: Record<MotionCategory, string> = {
  substantive: '实质性',
  procedural: '程序性',
  inquiry: '咨询',
  privilege: '个人特权',
};

export interface MotionStats {
  total: number;
  byCategory: Array<{ category: MotionCategory; count: number }>;
  /** 走完表决的动议数（含通过与否决） */
  decided: number;
  passed: number;
  failed: number;
  withdrawn: number;
  ruled: number;
  pending: number;
  /** 通过率 = passed / decided */
  passRate: number;
  /** 从提出到表决公布的平均时长 */
  avgDecisionMs: number;
}

export function computeMotionStats(state: SessionState): MotionStats {
  const motions = state.motions;
  const byCategoryMap = new Map<MotionCategory, number>();
  for (const m of motions) byCategoryMap.set(m.category, (byCategoryMap.get(m.category) ?? 0) + 1);

  const passed = motions.filter((m) => m.status === 'passed').length;
  const failed = motions.filter((m) => m.status === 'failed').length;
  const withdrawn = motions.filter((m) => m.status === 'withdrawn').length;
  const ruled = motions.filter((m) => m.status === 'ruled').length;
  const pending = motions.filter((m) => m.status === 'pending' || m.status === 'voting').length;
  const decided = passed + failed;

  const decisionMs: number[] = [];
  for (const v of state.votes) {
    if (v.subjectKind !== 'motion' || !v.closedAt) continue;
    const m = motions.find((x) => x.id === v.subjectId);
    if (!m) continue;
    decisionMs.push(Math.max(0, v.closedAt - m.proposedAt));
  }

  return {
    total: motions.length,
    byCategory: [...byCategoryMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    decided,
    passed,
    failed,
    withdrawn,
    ruled,
    pending,
    passRate: decided > 0 ? passed / decided : 0,
    avgDecisionMs:
      decisionMs.length > 0 ? decisionMs.reduce((a, b) => a + b, 0) / decisionMs.length : 0,
  };
}

/* ---------------------------------------------------------------- *
 * 3. 参与公平性
 * ---------------------------------------------------------------- */

export interface FairnessReport {
  total: number;
  spoke: number;
  silent: number;
  silentRatio: number;
  totalSpeeches: number;
  avgSpeeches: number;
  medianSpeeches: number;
  maxSpeeches: number;
  /** 发言时长的基尼系数：0 = 完全平均，1 = 一人独占 */
  gini: number;
  /** 发言次数分布，最后一档是 5 次及以上 */
  histogram: Array<{ label: string; count: number }>;
  /** 发言次数最多的前 5 名（delegationId） */
  topSpeakers: Array<{ delegationId: string; speeches: number; ms: number }>;
}

function giniOf(values: number[]): number {
  const xs = values.filter((v) => v > 0).sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return 0;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i += 1) acc += (i + 1) * xs[i];
  return (2 * acc) / (n * sum) - (n + 1) / n;
}

export function computeFairness(
  delegations: Delegation[],
  events: SessionEvent[],
): FairnessReport {
  const stats = computeParticipation(events);
  const counts = delegations.map((d) => stats.get(d.id)?.speeches ?? 0);
  const durations = delegations.map((d) => stats.get(d.id)?.speechMs ?? 0);
  const total = delegations.length;
  const spoke = counts.filter((c) => c > 0).length;
  const totalSpeeches = counts.reduce((a, b) => a + b, 0);

  const sorted = [...counts].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const buckets = [0, 1, 2, 3, 4];
  const histogram = buckets.map((b) => ({
    label: String(b),
    count: counts.filter((c) => c === b).length,
  }));
  histogram.push({ label: '5+', count: counts.filter((c) => c >= 5).length });

  const topSpeakers = delegations
    .map((d) => {
      const s = stats.get(d.id);
      return { delegationId: d.id, speeches: s?.speeches ?? 0, ms: s?.speechMs ?? 0 };
    })
    .filter((x) => x.speeches > 0)
    .sort((a, b) => b.ms - a.ms || b.speeches - a.speeches)
    .slice(0, 5);

  return {
    total,
    spoke,
    silent: total - spoke,
    silentRatio: total > 0 ? (total - spoke) / total : 0,
    totalSpeeches,
    avgSpeeches: total > 0 ? totalSpeeches / total : 0,
    medianSpeeches: median,
    maxSpeeches: counts.length > 0 ? Math.max(...counts) : 0,
    gini: giniOf(durations),
    histogram,
    topSpeakers,
  };
}

/* ---------------------------------------------------------------- *
 * 4. 出席率曲线（每次表决一个点）
 * ---------------------------------------------------------------- */

export interface TurnoutPoint {
  index: number;
  titleZh: string;
  cast: number;
  present: number;
  turnout: number;
  yes: number;
  no: number;
  abstain: number;
  pass: number;
  result: 'passed' | 'failed';
}

export function computeTurnout(state: SessionState): TurnoutPoint[] {
  const out: TurnoutPoint[] = [];
  state.votes.forEach((v, i) => {
    if (!v.result) return;
    const c = v.counts ?? { yes: 0, no: 0, abstain: 0, pass: 0 };
    const cast = c.yes + c.no + c.abstain + c.pass;
    const present = v.presentAtVote ?? cast;
    out.push({
      index: out.length + 1,
      titleZh: v.titleZh,
      cast,
      present,
      turnout: present > 0 ? Math.min(1, cast / present) : 0,
      yes: c.yes,
      no: c.no,
      abstain: c.abstain,
      pass: c.pass,
      result: v.result,
    });
    void i;
  });
  return out;
}

/* ---------------------------------------------------------------- *
 * 汇总
 * ---------------------------------------------------------------- */

export interface PostMortem {
  time: TimeAllocation;
  motions: MotionStats;
  fairness: FairnessReport;
  turnout: TurnoutPoint[];
  /** 本次会话涉及的总表决数（含被中止的） */
  voteCount: number;
  docCount: number;
}

export function buildPostMortem(
  state: SessionState,
  events: SessionEvent[],
  delegations: Delegation[],
): PostMortem {
  return {
    time: computeTimeAllocation(events),
    motions: computeMotionStats(state),
    fairness: computeFairness(delegations, events),
    turnout: computeTurnout(state),
    voteCount: state.votes.length,
    docCount: state.documents.length,
  };
}

/* ---------------------------------------------------------------- *
 * 格式化
 * ---------------------------------------------------------------- */

export function fmtDuration(ms: number): string {
  if (ms <= 0) return '0 分钟';
  const min = Math.round(ms / 60000);
  if (min < 1) return '<1 分钟';
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}

export function fmtPct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}
