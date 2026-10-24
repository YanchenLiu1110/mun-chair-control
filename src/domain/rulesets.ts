import type { MotionTypeDef, Ruleset } from './types';

/**
 * 动议类型模板。规则集只挑选、覆盖参数，不复制结构。
 */
const GA_MOTIONS: MotionTypeDef[] = [
  {
    id: 'moderated_caucus',
    nameZh: '有主持核心磋商',
    nameEn: 'Moderated Caucus',
    category: 'substantive',
    requiresVote: true,
    threshold: 'simple',
    debatable: false,
    defaultTotalSec: 600,
    defaultPerSpeakerSec: 60,
  },
  {
    id: 'unmoderated_caucus',
    nameZh: '自由磋商',
    nameEn: 'Unmoderated Caucus',
    category: 'substantive',
    requiresVote: true,
    threshold: 'simple',
    debatable: false,
    defaultTotalSec: 600,
  },
  {
    id: 'close_debate',
    nameZh: '结束辩论并进入投票',
    nameEn: 'Closure of Debate',
    category: 'substantive',
    requiresVote: true,
    threshold: 'two_thirds',
    debatable: true,
  },
  {
    id: 'extend_debate',
    nameZh: '延长辩论',
    nameEn: 'Extension of Debate',
    category: 'substantive',
    requiresVote: true,
    threshold: 'simple',
    debatable: false,
    defaultTotalSec: 600,
  },
  {
    id: 'suspend_meeting',
    nameZh: '暂停会议',
    nameEn: 'Suspension of the Meeting',
    category: 'procedural',
    requiresVote: true,
    threshold: 'simple',
    debatable: false,
  },
  {
    id: 'adjourn_meeting',
    nameZh: '休会',
    nameEn: 'Adjournment of the Meeting',
    category: 'procedural',
    requiresVote: true,
    threshold: 'simple',
    debatable: false,
  },
  {
    id: 'point_privilege',
    nameZh: '个人特权问题',
    nameEn: 'Point of Personal Privilege',
    category: 'privilege',
    requiresVote: false,
    threshold: 'none',
    debatable: false,
  },
  {
    id: 'point_order',
    nameZh: '程序性问题',
    nameEn: 'Point of Order',
    category: 'procedural',
    requiresVote: false,
    threshold: 'none',
    debatable: false,
  },
  {
    id: 'point_inquiry',
    nameZh: '咨询性问题',
    nameEn: 'Point of Parliamentary Inquiry',
    category: 'inquiry',
    requiresVote: false,
    threshold: 'none',
    debatable: false,
  },
];

export const GA_RULESET: Ruleset = {
  id: 'ga',
  nameZh: '联合国大会规则',
  nameEn: 'UNGA Rules of Procedure',
  quorumRatio: 1 / 3,
  majorityBasis: 'present_voting',
  motionPassRatio: 0.5,
  vetoEnabled: false,
  defaultSpeechSec: 90,
  warningSec: 30,
  motionThresholdRatio: 0.2,
  motionTypes: GA_MOTIONS,
  caucus: {
    moderatedMaxTotalSec: 1200,
    moderatedMaxPerSpeakerSec: 120,
    unmoderatedMaxTotalSec: 1200,
  },
};

export const UNSC_RULESET: Ruleset = {
  id: 'unsc',
  nameZh: '联合国安理会暂行议事规则',
  nameEn: 'UNSC Provisional Rules of Procedure',
  quorumRatio: 0.6,
  majorityBasis: 'present_voting',
  motionPassRatio: 0.6,
  vetoEnabled: true,
  defaultSpeechSec: 120,
  warningSec: 30,
  motionThresholdRatio: 0.2,
  motionTypes: [
    ...GA_MOTIONS.filter((m) => m.id !== 'close_debate'),
    {
      id: 'close_debate',
      nameZh: '结束辩论并进入表决',
      nameEn: 'Closure of Debate',
      category: 'substantive',
      requiresVote: true,
      threshold: 'two_thirds',
      debatable: false,
    },
    {
      id: 'invite_party',
      nameZh: '邀请非理事国参会',
      nameEn: 'Invitation of a Non-Member',
      category: 'procedural',
      requiresVote: false,
      threshold: 'none',
      debatable: false,
    },
  ],
  caucus: {
    moderatedMaxTotalSec: 900,
    moderatedMaxPerSpeakerSec: 90,
    unmoderatedMaxTotalSec: 900,
  },
};

export const RULESETS: Ruleset[] = [GA_RULESET, UNSC_RULESET];

export function getRuleset(id: string): Ruleset {
  return RULESETS.find((r) => r.id === id) ?? GA_RULESET;
}
