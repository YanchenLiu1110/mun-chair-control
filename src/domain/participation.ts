import type { SessionEvent } from './events';

/**
 * F3 · 沉默代表雷达的数据源
 *
 * 发言记录从事件流推导（不额外存状态），所以刷新、回放、撤销后统计自动一致。
 * 一次发言 = 上台（gsl/advance 或 caucus/next）+ 该轮设定时长。
 */

export interface ParticipationStat {
  delegationId: string;
  /** 发言次数 */
  speeches: number;
  /** 累计发言毫秒（按每轮设定时长计） */
  speechMs: number;
  /** 最近一次发言时间；从未发言为 null */
  lastSpokeAt: number | null;
}

export type RadarSort = 'count' | 'duration' | 'gap';

export const RADAR_SORT_LABEL: Record<RadarSort, string> = {
  count: '发言次数',
  duration: '发言时长',
  gap: '距上次发言',
};

export function computeParticipation(events: SessionEvent[]): Map<string, ParticipationStat> {
  const stats = new Map<string, ParticipationStat>();

  const touch = (id: string): ParticipationStat => {
    let s = stats.get(id);
    if (!s) {
      s = { delegationId: id, speeches: 0, speechMs: 0, lastSpokeAt: null };
      stats.set(id, s);
    }
    return s;
  };

  for (const ev of events) {
    if (ev.kind === 'gsl/advance') {
      const id = ev.payload.delegationId;
      if (!id) continue;
      const s = touch(id);
      s.speeches += 1;
      s.speechMs += ev.payload.durationSec * 1000;
      s.lastSpokeAt = ev.ts;
    } else if (ev.kind === 'caucus/next') {
      const id = ev.payload.delegationId;
      if (!id) continue;
      const s = touch(id);
      s.speeches += 1;
      s.speechMs += (ev.payload.perSpeakerSec ?? 0) * 1000;
      s.lastSpokeAt = ev.ts;
    } else if (ev.kind === 'yield/set' && ev.payload.target === 'delegate') {
      // 接收让渡也算一次实质发言
      const id = ev.payload.toDelegationId;
      if (!id) continue;
      const s = touch(id);
      s.speeches += 1;
      s.lastSpokeAt = ev.ts;
    }
  }

  return stats;
}

export interface RadarRow extends ParticipationStat {
  /** 发言时长占全场的比例 */
  share: number;
  /** 零发言 */
  silent: boolean;
  /** 参与度显著偏高 */
  heavy: boolean;
  /** 距上次发言毫秒；从未发言为 Infinity */
  gapMs: number;
}

export function buildRadar(
  delegationIds: string[],
  stats: Map<string, ParticipationStat>,
  now: number,
): RadarRow[] {
  const totalMs = [...stats.values()].reduce((sum, s) => sum + s.speechMs, 0);
  const n = Math.max(1, delegationIds.length);
  const avgSpeeches =
    [...stats.values()].reduce((sum, s) => sum + s.speeches, 0) / n;

  return delegationIds.map((id) => {
    const s = stats.get(id) ?? {
      delegationId: id,
      speeches: 0,
      speechMs: 0,
      lastSpokeAt: null,
    };
    const share = totalMs > 0 ? s.speechMs / totalMs : 0;
    return {
      ...s,
      share,
      silent: s.speeches === 0,
      // 占比超过平均值 2 倍，或次数超过平均 2.5 倍且至少 3 次
      heavy: share > (2 / n) || (s.speeches >= 3 && s.speeches > avgSpeeches * 2.5),
      gapMs: s.lastSpokeAt == null ? Number.POSITIVE_INFINITY : now - s.lastSpokeAt,
    };
  });
}

export function sortRadar(rows: RadarRow[], sort: RadarSort): RadarRow[] {
  const bySort = (a: RadarRow, b: RadarRow): number => {
    if (sort === 'count') return a.speeches - b.speeches;
    if (sort === 'duration') return a.speechMs - b.speechMs;
    // 距上次发言：越久越靠前；从未发言最靠前
    return b.gapMs - a.gapMs;
  };
  return [...rows].sort((a, b) => {
    // 零发言永远置顶
    if (a.silent !== b.silent) return a.silent ? -1 : 1;
    const s = bySort(a, b);
    return s !== 0 ? s : a.delegationId.localeCompare(b.delegationId);
  });
}

export function formatGap(ms: number): string {
  if (!Number.isFinite(ms)) return '未发言';
  const min = Math.floor(ms / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分前`;
}
