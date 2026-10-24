import { DOC_KIND_LABEL, DOC_STATUS_LABEL } from './documents';
import type { SessionEvent } from './events';
import type {
  Committee,
  Delegation,
  Ruleset,
  Session,
  SessionState,
  VoteChoice,
  VoteMode,
} from './types';
import { VOTE_CHOICE_LABEL, VOTE_MODE_LABEL } from './voting';

/* ==========================================================================
 * 结构化纪要：一份数据，两种渲染（Markdown / Word）
 * ========================================================================== */

export type MinutesLine =
  | { kind: 'h1' | 'h2' | 'p' | 'li'; text: string }
  | { kind: 'row'; cells: string[] }
  | { kind: 'th'; cells: string[] };

const PHASE_LABEL: Record<string, string> = {
  idle: '未开场',
  rollcall: '点名',
  agenda: '设定议题',
  debate: '正式辩论',
  moderated: '有主持核心磋商',
  unmoderated: '自由磋商',
  voting: '投票程序',
  closed: '已休会',
};

function hhmmss(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function dateOnly(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ==========================================================================
 * 单条事件的人话描述
 * ========================================================================== */

interface DescribeCtx {
  index: Map<string, Delegation>;
  motions: Map<string, string>;
  docs: Map<string, string>;
}

function nameOf(ctx: DescribeCtx, id: string | null | undefined): string {
  if (!id) return '—';
  return ctx.index.get(id)?.shortZh ?? id;
}

function describe(ev: SessionEvent, ctx: DescribeCtx): string {
  const p = ev.payload as Record<string, unknown>;
  const num = (k: string) => Number(p[k] ?? 0);

  switch (ev.kind) {
    case 'session/opened':
      return `会议开始（${String(p.label ?? '')}）`;
    case 'session/closed':
      return '会议结束';
    case 'agenda/set':
      return `设定议题：${String(p.topicZh)}（${String(p.topicEn)}）`;
    case 'phase/set':
      return `切换至「${PHASE_LABEL[String(p.phase)] ?? String(p.phase)}」`;

    case 'rollcall/marked':
      return `${nameOf(ctx, p.delegationId as string)} 标记为「${
        p.status === 'present' ? '出席' : p.status === 'present_voting' ? '出席并投票' : '缺席'
      }」`;
    case 'rollcall/markAll':
      return `批量点名：${(p.delegationIds as string[]).length} 国标记为「${
        p.status === 'present' ? '出席' : p.status === 'present_voting' ? '出席并投票' : '缺席'
      }」`;
    case 'rollcall/reset':
      return '重置点名';

    case 'gsl/add':
      return `${nameOf(ctx, p.delegationId as string)} 加入主发言名单`;
    case 'gsl/remove':
      return `${nameOf(ctx, p.delegationId as string)} 移出主发言名单`;
    case 'gsl/move':
      return `调整发言顺序：第 ${num('from') + 1} 位 → 第 ${num('to') + 1} 位`;
    case 'gsl/clear':
      return '清空主发言名单';
    case 'gsl/advance':
      return `${p.delegationId ? nameOf(ctx, p.delegationId as string) : '下一位代表'} 上台发言（${num('durationSec')}s）`;

    case 'timer/start':
      return `开始计时 ${num('durationSec')}s${p.speakerId ? ` · ${nameOf(ctx, p.speakerId as string)}` : ''}`;
    case 'timer/pause':
      return '暂停计时';
    case 'timer/resume':
      return '继续计时';
    case 'timer/reset':
      return '重置计时';
    case 'timer/extend':
      return `加时 ${num('addSec')}s`;
    case 'timer/expire':
      return '计时归零';

    case 'yield/set': {
      const target = String(p.target);
      if (target === 'chair') return '让渡时间给主席';
      if (target === 'delegate') return `让渡时间给 ${nameOf(ctx, p.toDelegationId as string)}`;
      if (target === 'questions') return '让渡时间给问题';
      return '让渡时间给评论';
    }
    case 'yield/clear':
      return '取消让渡';

    case 'caucus/open':
      return `${p.kind === 'moderated' ? '有主持核心磋商' : '自由磋商'}开始：${String(p.topicZh || '未命名议题')}（总 ${num('totalSec')}s${
        num('perSpeakerSec') > 0 ? `，单人 ${num('perSpeakerSec')}s` : ''
      }）`;
    case 'caucus/close':
      return '磋商结束';
    case 'caucus/enqueue':
      return `${nameOf(ctx, p.delegationId as string)} 加入磋商发言队列`;
    case 'caucus/dequeue':
      return `${nameOf(ctx, p.delegationId as string)} 移出磋商发言队列`;
    case 'caucus/next':
      return `${p.delegationId ? nameOf(ctx, p.delegationId as string) : '队列下一位'} 开始磋商发言`;

    case 'motion/propose':
      return `提出动议：${String(p.typeNameZh)}${p.topicZh ? ` · ${String(p.topicZh)}` : ''}（提出国：${nameOf(
        ctx,
        p.proposerId as string,
      )}）`;
    case 'motion/status': {
      const title = ctx.motions.get(String(p.motionId)) ?? '动议';
      const label: Record<string, string> = {
        pending: '待处理',
        voting: '进入表决',
        passed: '通过',
        failed: '未通过',
        withdrawn: '撤回',
        ruled: '主席裁定',
      };
      return `${title} → ${label[String(p.status)] ?? String(p.status)}`;
    }

    case 'vote/open':
      return `开始表决：${String(p.titleZh)}（${VOTE_MODE_LABEL[String(p.mode) as VoteMode]}）`;
    case 'vote/cast':
      return `${nameOf(ctx, p.delegationId as string)} 投「${
        VOTE_CHOICE_LABEL[String(p.choice) as VoteChoice]
      }」`;
    case 'vote/mode':
      return `表决模式切换为「${VOTE_MODE_LABEL[String(p.mode) as VoteMode]}」`;
    case 'vote/close':
      return `公布表决结果：${p.result === 'passed' ? '通过' : '未通过'}`;
    case 'vote/abort':
      return '取消表决';

    case 'doc/register':
      return `登记${DOC_KIND_LABEL[p.kind as keyof typeof DOC_KIND_LABEL].zh}：${String(p.titleZh)}`;
    case 'doc/role': {
      const doc = ctx.docs.get(String(p.docId)) ?? '文件';
      const role = p.role === 'sponsor' ? '起草国' : '附议国';
      return `${doc}：${nameOf(ctx, p.delegationId as string)} ${p.action === 'add' ? '加入' : '移出'}${role}`;
    }
    case 'doc/promote': {
      const doc = ctx.docs.get(String(p.docId)) ?? '工作文件';
      return `${doc} 升级为决议草案`;
    }
    case 'doc/status': {
      const doc = ctx.docs.get(String(p.docId)) ?? '文件';
      return `${doc} 状态变更为「${DOC_STATUS_LABEL[p.status as keyof typeof DOC_STATUS_LABEL]}」`;
    }

    default: {
      // 所有事件类型都已覆盖，这里是编译期兜底
      const never: never = ev;
      return String(never);
    }
  }
}

/* ==========================================================================
 * 组装纪要
 * ========================================================================== */

export interface MinutesInput {
  committee: Committee;
  session: Session;
  ruleset: Ruleset;
  state: SessionState;
  events: SessionEvent[];
}

export function buildMinutes({ committee, session, ruleset, state, events }: MinutesInput): MinutesLine[] {
  const index = new Map(committee.delegations.map((d) => [d.id, d]));
  const ctx: DescribeCtx = {
    index,
    motions: new Map(state.motions.map((m) => [m.id, m.typeNameZh])),
    docs: new Map(state.documents.map((d) => [d.id, `${d.code} ${d.titleZh}`])),
  };

  const names = (ids: string[]) =>
    ids.length === 0 ? '—' : ids.map((id) => index.get(id)?.shortZh ?? id).join('、');

  const presentVoting = committee.delegations.filter(
    (d) => (state.attendance[d.id] ?? 'absent') === 'present_voting',
  );
  const presentOnly = committee.delegations.filter((d) => state.attendance[d.id] === 'present');
  const absent = committee.delegations.filter(
    (d) => (state.attendance[d.id] ?? 'absent') === 'absent',
  );

  const out: MinutesLine[] = [];

  out.push({ kind: 'h1', text: `${committee.nameZh} · ${session.label} 会议纪要` });
  out.push({
    kind: 'p',
    text: `${committee.nameEn} ｜ 规则集：${ruleset.nameZh} ｜ 日期：${dateOnly(session.startedAt)} ｜ 导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
  });

  out.push({ kind: 'h2', text: '一、会议概况' });
  out.push({
    kind: 'li',
    text: `议题：${state.agenda ? `${state.agenda.topicZh}（${state.agenda.topicEn}）` : '未设定'}`,
  });
  out.push({ kind: 'li', text: `出席：${presentVoting.length + presentOnly.length} / ${committee.delegations.length} 国（其中出席并投票 ${presentVoting.length} 国）` });
  out.push({ kind: 'li', text: `动议：${state.motions.length} 项（通过 ${state.motions.filter((m) => m.status === 'passed').length} 项）` });
  out.push({ kind: 'li', text: `表决：${state.votes.length} 次（通过 ${state.votes.filter((v) => v.result === 'passed').length} 次）` });
  out.push({ kind: 'li', text: `文件：${state.documents.length} 份` });
  out.push({ kind: 'li', text: `操作事件：${events.length} 条` });

  out.push({ kind: 'h2', text: '二、出席情况' });
  out.push({ kind: 'li', text: `出席并投票（${presentVoting.length}）：${names(presentVoting.map((d) => d.id))}` });
  out.push({ kind: 'li', text: `出席（${presentOnly.length}）：${names(presentOnly.map((d) => d.id))}` });
  out.push({ kind: 'li', text: `缺席（${absent.length}）：${names(absent.map((d) => d.id))}` });

  out.push({ kind: 'h2', text: '三、动议与表决' });
  if (state.motions.length === 0) {
    out.push({ kind: 'p', text: '本次会期未提出动议。' });
  } else {
    out.push({ kind: 'th', cells: ['动议', '提出国', '议题', '时长', '结果'] });
    for (const m of state.motions) {
      out.push({
        kind: 'row',
        cells: [
          m.typeNameZh,
          names(m.proposerId ? [m.proposerId] : []),
          m.topicZh || '—',
          m.totalSec > 0 ? `总 ${m.totalSec}s${m.perSpeakerSec > 0 ? ` / 单人 ${m.perSpeakerSec}s` : ''}` : '—',
          m.status === 'passed' ? '通过' : m.status === 'failed' ? '未通过' : m.status === 'withdrawn' ? '撤回' : m.status === 'ruled' ? '已裁定' : '待处理',
        ],
      });
    }
  }

  if (state.votes.length > 0) {
    out.push({ kind: 'p', text: '' });
    out.push({ kind: 'th', cells: ['表决事项', '模式', '赞成', '反对', '弃权', '过', '结果'] });
    for (const v of state.votes) {
      out.push({
        kind: 'row',
        cells: [
          v.titleZh,
          VOTE_MODE_LABEL[v.mode],
          String(v.counts?.yes ?? '—'),
          String(v.counts?.no ?? '—'),
          String(v.counts?.abstain ?? '—'),
          String(v.counts?.pass ?? '—'),
          v.result ? (v.result === 'passed' ? '通过' : '未通过') : '已取消',
        ],
      });
    }
  }

  out.push({ kind: 'h2', text: '四、文件流转' });
  if (state.documents.length === 0) {
    out.push({ kind: 'p', text: '本次会期未登记文件。' });
  } else {
    out.push({ kind: 'th', cells: ['编号', '类型', '标题', '起草国', '附议国', '状态'] });
    for (const d of state.documents) {
      out.push({
        kind: 'row',
        cells: [
          d.code,
          DOC_KIND_LABEL[d.kind].zh,
          d.titleZh,
          names(d.sponsors),
          names(d.signatories),
          DOC_STATUS_LABEL[d.status],
        ],
      });
    }
  }

  out.push({ kind: 'h2', text: '五、全场时间轴' });
  for (const ev of events) {
    // 逐票记录不进时间轴，票数已在上面表格里
    if (ev.kind === 'vote/cast') continue;
    out.push({ kind: 'li', text: `${hhmmss(ev.ts)}　${describe(ev, ctx)}` });
  }

  return out;
}

/* ==========================================================================
 * 渲染：Markdown
 * ========================================================================== */

export function toMarkdown(lines: MinutesLine[]): string {
  const buf: string[] = [];
  for (const l of lines) {
    if (l.kind === 'h1') {
      // 标题前留空行，避免部分解析器把标题并进上一个列表
      if (buf.length > 0 && buf[buf.length - 1] !== '') buf.push('');
      buf.push(`# ${l.text}`, '');
    } else if (l.kind === 'h2') {
      if (buf.length > 0 && buf[buf.length - 1] !== '') buf.push('');
      buf.push(`## ${l.text}`, '');
    } else if (l.kind === 'p') buf.push(l.text, '');
    else if (l.kind === 'li') buf.push(`- ${l.text}`);
    else if (l.kind === 'th') {
      buf.push(`| ${l.cells.join(' | ')} |`);
      buf.push(`| ${l.cells.map(() => '---').join(' | ')} |`);
    } else if (l.kind === 'row') buf.push(`| ${l.cells.join(' | ')} |`);
  }
  return buf.join('\n').replace(/\n{3,}/g, '\n\n');
}

/* ==========================================================================
 * 渲染：Word（HTML 变体，Word / WPS 可直接打开）
 * ========================================================================== */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function toWordHtml(lines: MinutesLine[], title: string): string {
  const body: string[] = [];
  let inTable = false;

  for (const l of lines) {
    if (l.kind === 'th' || l.kind === 'row') {
      if (!inTable) {
        body.push('<table>');
        inTable = true;
      }
      const tag = l.kind === 'th' ? 'th' : 'td';
      body.push(`<tr>${l.cells.map((c) => `<${tag}>${esc(c)}</${tag}>`).join('')}</tr>`);
      continue;
    }
    if (inTable) {
      body.push('</table>');
      inTable = false;
    }
    if (l.kind === 'h1') body.push(`<h1>${esc(l.text)}</h1>`);
    else if (l.kind === 'h2') body.push(`<h2>${esc(l.text)}</h2>`);
    else if (l.kind === 'p') body.push(l.text ? `<p>${esc(l.text)}</p>` : '<p>&nbsp;</p>');
    else body.push(`<p class="li">· ${esc(l.text)}</p>`);
  }
  if (inTable) body.push('</table>');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 2cm; }
body { font-family: "PingFang SC", "Microsoft YaHei", "SimSun", serif; font-size: 10.5pt; line-height: 1.75; color: #111; }
h1 { font-size: 17pt; margin: 0 0 10pt; }
h2 { font-size: 12.5pt; margin: 16pt 0 6pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
p { margin: 3pt 0; }
p.li { margin: 2pt 0 2pt 8pt; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; }
th, td { border: 0.5pt solid #999; padding: 3pt 5pt; font-size: 9.5pt; text-align: left; vertical-align: top; }
th { background: #f0f0f0; font-weight: bold; }
</style>
</head>
<body>
${body.join('\n')}
</body>
</html>`;
}
