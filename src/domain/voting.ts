import type { Delegation, VoteChoice, VoteMode, VoteRecord } from './types';

/**
 * 表决判定。
 *
 * 口径说明（三条，写死并显示在界面上，避免会场争议）：
 * 1. 弃权与"过"都不计入赞成/反对，也不进入多数计算的分母 ——
 *    分母是「出席并投票」（yes + no），这是联合国"present and voting"的标准定义。
 * 2. 简单多数 = 赞成 > 反对（等价于 赞成 >= ⌊(yes+no)/2⌋+1）。
 * 3. 否决权模式 = 先按简单多数判，再叠加五常否决：任一常任理事国投反对即不通过。
 *    常任理事国弃权不构成否决（符合安理会实践）。
 */

export interface VoteTally {
  yes: number;
  no: number;
  abstain: number;
  pass: number;
  /** 已投票数（含弃权与过） */
  cast: number;
  /** 多数计算的分母 */
  basis: number;
  /** 通过所需的最少赞成票 */
  threshold: number;
  /** 仅看票数的结论（未叠加否决） */
  majorityReached: boolean;
  vetoedBy: Delegation[];
  /** 最终结论 */
  passed: boolean;
  mode: VoteMode;
}

export function tallyVote(vote: VoteRecord, delegations: Delegation[]): VoteTally {
  let yes = 0;
  let no = 0;
  let abstain = 0;
  let pass = 0;

  for (const choice of Object.values(vote.ballots)) {
    if (choice === 'yes') yes += 1;
    else if (choice === 'no') no += 1;
    else if (choice === 'abstain') abstain += 1;
    else pass += 1;
  }

  const basis = yes + no;
  const threshold =
    vote.mode === 'two_thirds' ? Math.ceil((basis * 2) / 3) : Math.floor(basis / 2) + 1;

  const majorityReached = basis > 0 && yes >= threshold;

  const vetoedBy =
    vote.mode === 'veto'
      ? delegations.filter((d) => d.isP5 && vote.ballots[d.id] === 'no')
      : [];

  const passed = majorityReached && vetoedBy.length === 0;

  return {
    yes,
    no,
    abstain,
    pass,
    cast: yes + no + abstain + pass,
    basis,
    threshold,
    majorityReached,
    vetoedBy,
    passed,
    mode: vote.mode,
  };
}

export const VOTE_CHOICE_LABEL: Record<VoteChoice, string> = {
  yes: '赞成',
  no: '反对',
  abstain: '弃权',
  pass: '过',
};

export const VOTE_CHOICE_SHORT: Record<VoteChoice, string> = {
  yes: '赞',
  no: '反',
  abstain: '弃',
  pass: '过',
};

export const VOTE_MODE_LABEL: Record<VoteMode, string> = {
  simple: '简单多数',
  two_thirds: '三分之二多数',
  veto: '简单多数 + 五常否决',
};
