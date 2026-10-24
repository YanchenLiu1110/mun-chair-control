import type { Delegation } from './types';

/**
 * 常用模联国家名册种子。
 * 元组：[中文全称, 英文全称, 中文短名, 国旗, 是否五常]
 */
const SEED: Array<[string, string, string, string, boolean]> = [
  ['中华人民共和国', 'China', '中国', '🇨🇳', true],
  ['美利坚合众国', 'United States', '美国', '🇺🇸', true],
  ['大不列颠及北爱尔兰联合王国', 'United Kingdom', '英国', '🇬🇧', true],
  ['法兰西共和国', 'France', '法国', '🇫🇷', true],
  ['俄罗斯联邦', 'Russian Federation', '俄罗斯', '🇷🇺', true],
  ['德意志联邦共和国', 'Germany', '德国', '🇩🇪', false],
  ['日本国', 'Japan', '日本', '🇯🇵', false],
  ['印度共和国', 'India', '印度', '🇮🇳', false],
  ['巴西联邦共和国', 'Brazil', '巴西', '🇧🇷', false],
  ['南非共和国', 'South Africa', '南非', '🇿🇦', false],
  ['加拿大', 'Canada', '加拿大', '🇨🇦', false],
  ['澳大利亚联邦', 'Australia', '澳大利亚', '🇦🇺', false],
  ['意大利共和国', 'Italy', '意大利', '🇮🇹', false],
  ['西班牙王国', 'Spain', '西班牙', '🇪🇸', false],
  ['大韩民国', 'Republic of Korea', '韩国', '🇰🇷', false],
  ['墨西哥合众国', 'Mexico', '墨西哥', '🇲🇽', false],
  ['阿根廷共和国', 'Argentina', '阿根廷', '🇦🇷', false],
  ['阿拉伯埃及共和国', 'Egypt', '埃及', '🇪🇬', false],
  ['尼日利亚联邦共和国', 'Nigeria', '尼日利亚', '🇳🇬', false],
  ['肯尼亚共和国', 'Kenya', '肯尼亚', '🇰🇪', false],
  ['沙特阿拉伯王国', 'Saudi Arabia', '沙特', '🇸🇦', false],
  ['阿拉伯联合酋长国', 'United Arab Emirates', '阿联酋', '🇦🇪', false],
  ['土耳其共和国', 'Türkiye', '土耳其', '🇹🇷', false],
  ['伊朗伊斯兰共和国', 'Iran', '伊朗', '🇮🇷', false],
  ['以色列国', 'Israel', '以色列', '🇮🇱', false],
  ['巴基斯坦伊斯兰共和国', 'Pakistan', '巴基斯坦', '🇵🇰', false],
  ['印度尼西亚共和国', 'Indonesia', '印尼', '🇮🇩', false],
  ['马来西亚', 'Malaysia', '马来西亚', '🇲🇾', false],
  ['新加坡共和国', 'Singapore', '新加坡', '🇸🇬', false],
  ['越南社会主义共和国', 'Viet Nam', '越南', '🇻🇳', false],
  ['泰王国', 'Thailand', '泰国', '🇹🇭', false],
  ['菲律宾共和国', 'Philippines', '菲律宾', '🇵🇭', false],
  ['新西兰', 'New Zealand', '新西兰', '🇳🇿', false],
  ['荷兰王国', 'Netherlands', '荷兰', '🇳🇱', false],
  ['比利时王国', 'Belgium', '比利时', '🇧🇪', false],
  ['瑞典王国', 'Sweden', '瑞典', '🇸🇪', false],
  ['挪威王国', 'Norway', '挪威', '🇳🇴', false],
  ['丹麦王国', 'Denmark', '丹麦', '🇩🇰', false],
  ['芬兰共和国', 'Finland', '芬兰', '🇫🇮', false],
  ['瑞士联邦', 'Switzerland', '瑞士', '🇨🇭', false],
  ['波兰共和国', 'Poland', '波兰', '🇵🇱', false],
  ['乌克兰', 'Ukraine', '乌克兰', '🇺🇦', false],
  ['希腊共和国', 'Greece', '希腊', '🇬🇷', false],
  ['葡萄牙共和国', 'Portugal', '葡萄牙', '🇵🇹', false],
  ['奥地利共和国', 'Austria', '奥地利', '🇦🇹', false],
  ['智利共和国', 'Chile', '智利', '🇨🇱', false],
  ['哥伦比亚共和国', 'Colombia', '哥伦比亚', '🇨🇴', false],
  ['秘鲁共和国', 'Peru', '秘鲁', '🇵🇪', false],
  ['委内瑞拉玻利瓦尔共和国', 'Venezuela', '委内瑞拉', '🇻🇪', false],
  ['古巴共和国', 'Cuba', '古巴', '🇨🇺', false],
  ['哈萨克斯坦共和国', 'Kazakhstan', '哈萨克斯坦', '🇰🇿', false],
  ['孟加拉人民共和国', 'Bangladesh', '孟加拉国', '🇧🇩', false],
  ['斯里兰卡民主社会主义共和国', 'Sri Lanka', '斯里兰卡', '🇱🇰', false],
  ['尼泊尔联邦民主共和国', 'Nepal', '尼泊尔', '🇳🇵', false],
  ['蒙古国', 'Mongolia', '蒙古', '🇲🇳', false],
  ['卡塔尔国', 'Qatar', '卡塔尔', '🇶🇦', false],
  ['科威特国', 'Kuwait', '科威特', '🇰🇼', false],
  ['摩洛哥王国', 'Morocco', '摩洛哥', '🇲🇦', false],
  ['埃塞俄比亚联邦民主共和国', 'Ethiopia', '埃塞俄比亚', '🇪🇹', false],
  ['加纳共和国', 'Ghana', '加纳', '🇬🇭', false],
  ['坦桑尼亚联合共和国', 'Tanzania', '坦桑尼亚', '🇹🇿', false],
  ['阿尔及利亚人民民主共和国', 'Algeria', '阿尔及利亚', '🇩🇿', false],

  /* —— 以下为扩充池：委员会规模不受 62 限制，最多可直接取到 130 席 —— */
  ['爱尔兰', 'Ireland', '爱尔兰', '🇮🇪', false],
  ['捷克共和国', 'Czechia', '捷克', '🇨🇿', false],
  ['匈牙利', 'Hungary', '匈牙利', '🇭🇺', false],
  ['罗马尼亚', 'Romania', '罗马尼亚', '🇷🇴', false],
  ['保加利亚共和国', 'Bulgaria', '保加利亚', '🇧🇬', false],
  ['塞尔维亚共和国', 'Serbia', '塞尔维亚', '🇷🇸', false],
  ['克罗地亚共和国', 'Croatia', '克罗地亚', '🇭🇷', false],
  ['斯洛伐克共和国', 'Slovakia', '斯洛伐克', '🇸🇰', false],
  ['斯洛文尼亚共和国', 'Slovenia', '斯洛文尼亚', '🇸🇮', false],
  ['白俄罗斯共和国', 'Belarus', '白俄罗斯', '🇧🇾', false],
  ['立陶宛共和国', 'Lithuania', '立陶宛', '🇱🇹', false],
  ['拉脱维亚共和国', 'Latvia', '拉脱维亚', '🇱🇻', false],
  ['爱沙尼亚共和国', 'Estonia', '爱沙尼亚', '🇪🇪', false],
  ['冰岛共和国', 'Iceland', '冰岛', '🇮🇸', false],
  ['卢森堡大公国', 'Luxembourg', '卢森堡', '🇱🇺', false],
  ['马耳他共和国', 'Malta', '马耳他', '🇲🇹', false],
  ['塞浦路斯共和国', 'Cyprus', '塞浦路斯', '🇨🇾', false],
  ['格鲁吉亚', 'Georgia', '格鲁吉亚', '🇬🇪', false],
  ['亚美尼亚共和国', 'Armenia', '亚美尼亚', '🇦🇲', false],
  ['阿塞拜疆共和国', 'Azerbaijan', '阿塞拜疆', '🇦🇿', false],
  ['乌兹别克斯坦共和国', 'Uzbekistan', '乌兹别克斯坦', '🇺🇿', false],
  ['土库曼斯坦', 'Turkmenistan', '土库曼斯坦', '🇹🇲', false],
  ['吉尔吉斯共和国', 'Kyrgyzstan', '吉尔吉斯斯坦', '🇰🇬', false],
  ['塔吉克斯坦共和国', 'Tajikistan', '塔吉克斯坦', '🇹🇯', false],
  ['阿富汗伊斯兰共和国', 'Afghanistan', '阿富汗', '🇦🇫', false],
  ['伊拉克共和国', 'Iraq', '伊拉克', '🇮🇶', false],
  ['阿拉伯叙利亚共和国', 'Syria', '叙利亚', '🇸🇾', false],
  ['黎巴嫩共和国', 'Lebanon', '黎巴嫩', '🇱🇧', false],
  ['约旦哈希姆王国', 'Jordan', '约旦', '🇯🇴', false],
  ['阿曼苏丹国', 'Oman', '阿曼', '🇴🇲', false],
  ['巴林王国', 'Bahrain', '巴林', '🇧🇭', false],
  ['也门共和国', 'Yemen', '也门', '🇾🇪', false],
  ['缅甸联邦共和国', 'Myanmar', '缅甸', '🇲🇲', false],
  ['柬埔寨王国', 'Cambodia', '柬埔寨', '🇰🇭', false],
  ['老挝人民民主共和国', 'Laos', '老挝', '🇱🇦', false],
  ['文莱达鲁萨兰国', 'Brunei', '文莱', '🇧🇳', false],
  ['东帝汶民主共和国', 'Timor-Leste', '东帝汶', '🇹🇱', false],
  ['巴布亚新几内亚', 'Papua New Guinea', '巴新', '🇵🇬', false],
  ['斐济共和国', 'Fiji', '斐济', '🇫🇯', false],
  ['萨摩亚独立国', 'Samoa', '萨摩亚', '🇼🇸', false],
  ['汤加王国', 'Tonga', '汤加', '🇹🇴', false],
  ['瓦努阿图共和国', 'Vanuatu', '瓦努阿图', '🇻🇺', false],
  ['所罗门群岛', 'Solomon Islands', '所罗门', '🇸🇧', false],
  ['厄瓜多尔共和国', 'Ecuador', '厄瓜多尔', '🇪🇨', false],
  ['多民族玻利维亚国', 'Bolivia', '玻利维亚', '🇧🇴', false],
  ['巴拉圭共和国', 'Paraguay', '巴拉圭', '🇵🇾', false],
  ['乌拉圭东岸共和国', 'Uruguay', '乌拉圭', '🇺🇾', false],
  ['圭亚那共和国', 'Guyana', '圭亚那', '🇬🇾', false],
  ['苏里南共和国', 'Suriname', '苏里南', '🇸🇷', false],
  ['巴拿马共和国', 'Panama', '巴拿马', '🇵🇦', false],
  ['哥斯达黎加共和国', 'Costa Rica', '哥斯达黎加', '🇨🇷', false],
  ['危地马拉共和国', 'Guatemala', '危地马拉', '🇬🇹', false],
  ['洪都拉斯共和国', 'Honduras', '洪都拉斯', '🇭🇳', false],
  ['萨尔瓦多共和国', 'El Salvador', '萨尔瓦多', '🇸🇻', false],
  ['尼加拉瓜共和国', 'Nicaragua', '尼加拉瓜', '🇳🇮', false],
  ['多米尼加共和国', 'Dominican Republic', '多米尼加', '🇩🇴', false],
  ['牙买加', 'Jamaica', '牙买加', '🇯🇲', false],
  ['海地共和国', 'Haiti', '海地', '🇭🇹', false],
  ['特立尼达和多巴哥共和国', 'Trinidad and Tobago', '特多', '🇹🇹', false],
  ['巴哈马国', 'Bahamas', '巴哈马', '🇧🇸', false],
  ['巴巴多斯', 'Barbados', '巴巴多斯', '🇧🇧', false],
  ['利比亚国', 'Libya', '利比亚', '🇱🇾', false],
  ['突尼斯共和国', 'Tunisia', '突尼斯', '🇹🇳', false],
  ['苏丹共和国', 'Sudan', '苏丹', '🇸🇩', false],
  ['南苏丹共和国', 'South Sudan', '南苏丹', '🇸🇸', false],
  ['索马里联邦共和国', 'Somalia', '索马里', '🇸🇴', false],
  ['厄立特里亚国', 'Eritrea', '厄立特里亚', '🇪🇷', false],
  ['吉布提共和国', 'Djibouti', '吉布提', '🇩🇯', false],
  ['乌干达共和国', 'Uganda', '乌干达', '🇺🇬', false],
  ['卢旺达共和国', 'Rwanda', '卢旺达', '🇷🇼', false],
  ['布隆迪共和国', 'Burundi', '布隆迪', '🇧🇮', false],
  ['塞内加尔共和国', 'Senegal', '塞内加尔', '🇸🇳', false],
  ['马里共和国', 'Mali', '马里', '🇲🇱', false],
  ['布基纳法索', 'Burkina Faso', '布基纳法索', '🇧🇫', false],
  ['尼日尔共和国', 'Niger', '尼日尔', '🇳🇪', false],
  ['乍得共和国', 'Chad', '乍得', '🇹🇩', false],
  ['喀麦隆共和国', 'Cameroon', '喀麦隆', '🇨🇲', false],
  ['科特迪瓦共和国', "Côte d'Ivoire", '科特迪瓦', '🇨🇮', false],
  ['几内亚共和国', 'Guinea', '几内亚', '🇬🇳', false],
  ['塞拉利昂共和国', 'Sierra Leone', '塞拉利昂', '🇸🇱', false],
  ['利比里亚共和国', 'Liberia', '利比里亚', '🇱🇷', false],
  ['多哥共和国', 'Togo', '多哥', '🇹🇬', false],
  ['贝宁共和国', 'Benin', '贝宁', '🇧🇯', false],
  ['加蓬共和国', 'Gabon', '加蓬', '🇬🇦', false],
  ['刚果共和国', 'Congo', '刚果(布)', '🇨🇬', false],
  ['刚果民主共和国', 'DR Congo', '刚果(金)', '🇨🇩', false],
  ['安哥拉共和国', 'Angola', '安哥拉', '🇦🇴', false],
  ['赞比亚共和国', 'Zambia', '赞比亚', '🇿🇲', false],
  ['津巴布韦共和国', 'Zimbabwe', '津巴布韦', '🇿🇼', false],
  ['莫桑比克共和国', 'Mozambique', '莫桑比克', '🇲🇿', false],
  ['马达加斯加共和国', 'Madagascar', '马达加斯加', '🇲🇬', false],
  ['毛里求斯共和国', 'Mauritius', '毛里求斯', '🇲🇺', false],
  ['纳米比亚共和国', 'Namibia', '纳米比亚', '🇳🇦', false],
  ['博茨瓦纳共和国', 'Botswana', '博茨瓦纳', '🇧🇼', false],
  ['马拉维共和国', 'Malawi', '马拉维', '🇲🇼', false],
];

function slug(en: string): string {
  return en
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** 全量候选池（顺序即默认优先级：五常 → 主要国家 → 其余） */
export function poolDelegations(): Delegation[] {
  return SEED.map(([nameZh, nameEn, shortZh, flag, isP5]) => ({
    id: `d-${slug(nameEn)}`,
    nameZh,
    nameEn,
    shortZh,
    flag,
    isP5,
  }));
}

export const POOL_SIZE = SEED.length;

/** 兼容旧调用：默认名册 = 池子前 62 席 */
export function seedDelegations(count = 62): Delegation[] {
  return poolDelegations().slice(0, Math.max(1, Math.min(POOL_SIZE, count)));
}

/** 安理会 15 国 */
const UNSC_MEMBERS = [
  'China',
  'United States',
  'United Kingdom',
  'France',
  'Russian Federation',
  'Japan',
  'Brazil',
  'India',
  'Germany',
  'South Africa',
  'Egypt',
  'Ethiopia',
  'Kenya',
  'Mexico',
  'Kazakhstan',
];

export function unscDelegations(): Delegation[] {
  const all = poolDelegations();
  return UNSC_MEMBERS.map((en) => all.find((d) => d.nameEn === en)).filter(
    (d): d is Delegation => Boolean(d),
  );
}

/** 名册预设：给设置页做快捷按钮 */
export interface RosterPreset {
  id: string;
  label: string;
  build: () => Delegation[];
}

export const ROSTER_PRESETS: RosterPreset[] = [
  { id: 'unsc', label: '安理会 15', build: unscDelegations },
  { id: 'small', label: '小委会 20', build: () => seedDelegations(20) },
  { id: 'mid', label: '中委会 40', build: () => seedDelegations(40) },
  { id: 'ga62', label: '大会 62', build: () => seedDelegations(62) },
  { id: 'full', label: `全池 ${POOL_SIZE}`, build: () => poolDelegations() },
];

/**
 * 从池子里"续上"若干席，跳过已在名册中的国家。
 * 用于把名册从 N 直接扩到 M —— 而不是从头重建，避免已改过的自定义代表被冲掉。
 */
export function extendRoster(current: Delegation[], target: number): Delegation[] {
  const have = new Set(current.map((d) => d.id));
  const out = [...current];
  for (const d of poolDelegations()) {
    if (out.length >= target) break;
    if (have.has(d.id)) continue;
    out.push(d);
    have.add(d.id);
  }
  return out;
}

export interface CustomDelegationInput {
  nameZh: string;
  nameEn: string;
  shortZh?: string;
  flag?: string;
  isP5?: boolean;
}

/**
 * 自定义代表：不要求来自池子。
 * id 用英文名派生，重名时加序号 —— 事件流靠 id 关联，必须稳定且唯一。
 */
export function makeDelegation(input: CustomDelegationInput, existing: Delegation[]): Delegation {
  const nameEn = input.nameEn.trim() || input.nameZh.trim();
  const base = slug(nameEn) || 'custom';
  const used = new Set(existing.map((d) => d.id));
  let id = `d-${base}`;
  let n = 2;
  while (used.has(id)) {
    id = `d-${base}-${n}`;
    n += 1;
  }
  const nameZh = input.nameZh.trim() || nameEn;
  return {
    id,
    nameZh,
    nameEn: nameEn,
    shortZh: (input.shortZh ?? nameZh).trim(),
    flag: input.flag?.trim() || '🏳️',
    isP5: Boolean(input.isP5),
  };
}

/** 在池子里但尚未被选中的候选，供"添加"下拉使用 */
export function availableFromPool(current: Delegation[]): Delegation[] {
  const have = new Set(current.map((d) => d.id));
  return poolDelegations().filter((d) => !have.has(d.id));
}
