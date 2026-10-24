import type { Delegation, Ruleset, SessionState } from './types';

/* ==========================================================================
 * 法定人数与表决门槛
 * 全部是纯函数：状态 + 名册 + 规则集 → 数字。不缓存、不落库。
 * ========================================================================== */

export interface QuorumInfo {
  /** 委员会总代表数 */
  total: number;
  /** 出席（含出席并投票） */
  present: number;
  /** 出席并投票 —— 多数表决的计算基数 */
  presentVoting: number;
  /** 法定人数 */
  quorum: number;
  /** 法定人数是否达成 */
  quorumMet: boolean;
  /** 简单多数（过半数） */
  simpleMajority: number;
  /** 三分之二多数 */
  twoThirds: number;
  /** 动议门槛（如 20% 出席） */
  motionThreshold: number;
  /** 否决权模式下的一票否决方 */
  vetoMembers: Delegation[];
}

export function computeQuorum(
  state: SessionState,
  delegations: Delegation[],
  ruleset: Ruleset,
): QuorumInfo {
  const total = delegations.length;
  let present = 0;
  let presentVoting = 0;

  for (const d of delegations) {
    const s = state.attendance[d.id] ?? 'absent';
    if (s === 'present') present += 1;
    else if (s === 'present_voting') presentVoting += 1;
  }
  present += presentVoting;

  const basis = ruleset.majorityBasis === 'present' ? present : presentVoting;
  const quorum = Math.ceil(total * ruleset.quorumRatio);

  return {
    total,
    present,
    presentVoting,
    quorum,
    quorumMet: present >= quorum,
    simpleMajority: Math.floor(basis / 2) + 1,
    twoThirds: Math.ceil((basis * 2) / 3),
    motionThreshold: Math.ceil(present * ruleset.motionThresholdRatio),
    vetoMembers: delegations.filter((d) => d.isP5),
  };
}

/* ==========================================================================
 * 名册查找
 * ========================================================================== */

export function buildIndex(delegations: Delegation[]): Map<string, Delegation> {
  return new Map(delegations.map((d) => [d.id, d]));
}

export function labelOf(index: Map<string, Delegation>, id: string | null): string {
  if (!id) return '—';
  const d = index.get(id);
  return d ? d.shortZh : '未知代表';
}

export function fullLabelOf(index: Map<string, Delegation>, id: string | null): string {
  if (!id) return '—';
  const d = index.get(id);
  return d ? `${d.flag} ${d.nameZh}` : '未知代表';
}

/* ==========================================================================
 * 发言统计（F3 沉默代表雷达的数据源，先建好派生层）
 * ========================================================================== */

export interface SpeechStat {
  delegationId: string;
  /** 发言次数 */
  count: number;
  /** 累计发言毫秒 */
  totalMs: number;
  /** 距上次发言的毫秒数；从未发言为 Infinity */
  sinceLastMs: number;
}

/**
 * 说明：真正的发言时长统计依赖完整事件流（Stage 3 引入 speaker 统计事件）。
 * 这里先给出基于「当前名单 + 讲台」的最小可用版本，接口保持稳定。
 */
export function computeSpeechStats(state: SessionState, now: number): Map<string, SpeechStat> {
  const stats = new Map<string, SpeechStat>();
  const touch = (id: string): SpeechStat => {
    let s = stats.get(id);
    if (!s) {
      s = { delegationId: id, count: 0, totalMs: 0, sinceLastMs: Number.POSITIVE_INFINITY };
      stats.set(id, s);
    }
    return s;
  };

  // 已发言的：名单中当前下标之前的都算讲过一轮
  for (let i = 0; i < Math.max(0, state.gsl.currentIndex); i += 1) {
    const id = state.gsl.order[i];
    if (!id) continue;
    const s = touch(id);
    s.count += 1;
  }

  const speakingId = state.floor.speakingId;
  if (speakingId) {
    const s = touch(speakingId);
    s.count += 1;
    s.totalMs += Math.max(0, state.floor.timer.durationMs - state.floor.timer.remainingMs);
    s.sinceLastMs = 0;
  }

  void now;
  return stats;
}
