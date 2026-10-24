import { useMemo, useRef, useState } from 'react';
import type { SessionEvent } from '../domain/events';
import {
  buildPostMortem,
  fmtDuration,
  fmtPct,
  MOTION_CATEGORY_LABEL,
  TIME_BUCKET_HINT,
  TIME_BUCKET_LABEL,
} from '../domain/postmortem';
import type { PostMortem, TimeBucket } from '../domain/postmortem';
import type { Committee, Session, SessionState } from '../domain/types';
import { imageToPdf, saveBlob, svgToPng } from '../lib/exportReport';

interface Props {
  open: boolean;
  onClose: () => void;
  committee: Committee;
  session: Session | null;
  state: SessionState;
  events: SessionEvent[];
}

const W = 1240;
const H = 880;

const C = {
  ink: '#14171d',
  ink2: '#4b5563',
  ink3: '#8b93a2',
  line: '#e5e9f0',
  panel: '#ffffff',
  accent: '#3b6fd4',
  bad: '#c0392b',
};

const BUCKET_COLOR: Record<TimeBucket, string> = {
  formal: '#3b6fd4',
  moderated: '#7c5cd6',
  unmoderated: '#2fa38a',
  voting: '#d97706',
  other: '#9aa6b8',
};

function Panel(props: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  en: string;
  children: React.ReactNode;
}) {
  const { x, y, w, h, title, en, children } = props;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={C.panel} stroke={C.line} />
      <text x={x + 20} y={y + 28} fontSize={13.5} fontWeight={700} fill={C.ink}>
        {title}
      </text>
      <text x={x + 20 + title.length * 15 + 8} y={y + 28} fontSize={10.5} fill={C.ink3}>
        {en}
      </text>
      <line x1={x} y1={y + 42} x2={x + w} y2={y + 42} stroke={C.line} />
      {children}
    </g>
  );
}

/** 两列桑基：左=总时长，右=五类活动 */
function Sankey({ data, x, y, w, h }: { data: PostMortem['time']; x: number; y: number; w: number; h: number }) {
  const slices = data.slices;
  if (slices.length === 0) {
    return (
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize={12} fill={C.ink3}>
        本场次还没有可用于统计的时间线
      </text>
    );
  }

  const top = y + 74;
  const H0 = h - 106;
  const nodeW = 14;
  const x1 = x + 24;
  const x2 = x + 470;
  const gap = 9;
  const available = H0 - gap * (slices.length - 1);

  let cursor = top;
  const rows = slices.map((s) => {
    const height = Math.max(6, s.share * available);
    const row = { ...s, y: cursor, h: height };
    cursor += height + gap;
    return row;
  });

  // 左侧总时长节点（整段）
  const totalH = rows.reduce((acc, r) => acc + r.h, 0) + gap * (rows.length - 1);

  // 源侧不留缝：带宽首尾相接，只有目标侧才需要 gap
  let srcCursor = top;
  return (
    <g>
      <rect x={x1} y={top} width={nodeW} height={totalH} rx={3} fill="#c9d3e4" />
      <text x={x1} y={top - 12} fontSize={11.5} fontWeight={600} fill={C.ink}>
        会议总时长
        <tspan fontWeight={400} fill={C.ink3} fontSize={10.5} dx={6}>
          {fmtDuration(data.totalMs)}
        </tspan>
      </text>

      {rows.map((r) => {
        const sy = srcCursor;
        const sh = r.h;
        srcCursor += sh;
        const mid = (x1 + nodeW + x2) / 2;
        const path =
          `M${x1 + nodeW},${sy} C${mid},${sy} ${mid},${r.y} ${x2},${r.y} ` +
          `L${x2},${r.y + r.h} C${mid},${r.y + r.h} ${mid},${sy + sh} ${x1 + nodeW},${sy + sh} Z`;
        const tall = r.h >= 34;
        const nameY = r.y + Math.min(r.h / 2 + 4, r.h - 6);
        return (
          <g key={r.bucket}>
            <path d={path} fill={BUCKET_COLOR[r.bucket]} fillOpacity={0.22} />
            <rect x={x2} y={r.y} width={nodeW} height={r.h} rx={3} fill={BUCKET_COLOR[r.bucket]} />
            <text x={x2 + nodeW + 12} y={nameY} fontSize={11.5} fontWeight={600} fill={C.ink}>
              {TIME_BUCKET_LABEL[r.bucket]}
            </text>
            {tall && (
              <text x={x2 + nodeW + 12} y={nameY + 14} fontSize={10} fill={C.ink3}>
                {TIME_BUCKET_HINT[r.bucket]}
              </text>
            )}
            <text x={x + w - 24} y={nameY} textAnchor="end" fontSize={11} fill={C.ink2}>
              {fmtDuration(r.ms)}
              {tall ? '' : ` · ${fmtPct(r.share)}`}
            </text>
            {tall && (
              <text x={x + w - 24} y={nameY + 14} textAnchor="end" fontSize={10.5} fill={C.ink3}>
                {fmtPct(r.share)}
              </text>
            )}
          </g>
        );
      })}

      {data.trimmedMs > 0 && (
        <text x={x + 24} y={y + h - 12} fontSize={9.5} fill={C.ink3}>
          已剔除 {fmtDuration(data.trimmedMs)} 的超长空转（单段上限 {data.capMs / 60000} 分钟）
        </text>
      )}
    </g>
  );
}

function MotionPanel({ data, x, y, w, h }: { data: PostMortem['motions']; x: number; y: number; w: number; h: number }) {
  if (data.total === 0) {
    return (
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize={12} fill={C.ink3}>
        本场次尚未提出动议
      </text>
    );
  }

  const kpis = [
    { label: '动议总数', value: String(data.total) },
    { label: '通过率', value: data.decided > 0 ? fmtPct(data.passRate) : '—' },
    { label: '平均裁定耗时', value: data.avgDecisionMs > 0 ? fmtDuration(data.avgDecisionMs) : '—' },
  ];

  const maxCount = Math.max(1, ...data.byCategory.map((c) => c.count));
  const barX = x + 118;
  const barMax = w - 118 - 70;

  const pills = [
    { label: '通过', n: data.passed, color: C.accent },
    { label: '否决', n: data.failed, color: C.bad },
    { label: '撤回', n: data.withdrawn, color: C.ink3 },
    { label: '裁定', n: data.ruled, color: C.ink3 },
    { label: '待处理', n: data.pending, color: '#d97706' },
  ].filter((p) => p.n > 0);

  return (
    <g>
      {kpis.map((k, i) => (
        <g key={k.label}>
          <text x={x + 20} y={y + 70 + i * 44} fontSize={10.5} fill={C.ink3}>
            {k.label}
          </text>
          <text x={x + 20} y={y + 94 + i * 44} fontSize={19} fontWeight={700} fill={C.ink}>
            {k.value}
          </text>
        </g>
      ))}

      <text x={x + 180} y={y + 70} fontSize={10.5} fill={C.ink3}>
        按类别
      </text>
      {data.byCategory.map((c, i) => {
        const bw = (c.count / maxCount) * barMax;
        return (
          <g key={c.category}>
            <text x={x + 180} y={y + 92 + i * 26} fontSize={11} fill={C.ink2}>
              {MOTION_CATEGORY_LABEL[c.category]}
            </text>
            <rect x={barX + 62} y={y + 82 + i * 26} width={barMax} height={9} rx={4.5} fill="#eef1f7" />
            <rect x={barX + 62} y={y + 82 + i * 26} width={Math.max(2, bw)} height={9} rx={4.5} fill="#9db4e0" />
            <text x={x + w - 24} y={y + 92 + i * 26} textAnchor="end" fontSize={11} fontWeight={600} fill={C.ink2}>
              {c.count}
            </text>
          </g>
        );
      })}

      <line x1={x + 20} y1={y + h - 58} x2={x + w - 20} y2={y + h - 58} stroke={C.line} />
      {pills.map((p, i) => (
        <g key={p.label}>
          <text x={x + 20 + i * 74} y={y + h - 32} fontSize={10.5} fill={C.ink3}>
            {p.label}
          </text>
          <text x={x + 20 + i * 74} y={y + h - 16} fontSize={13} fontWeight={700} fill={p.color}>
            {p.n}
          </text>
        </g>
      ))}
    </g>
  );
}

function FairnessPanel({ data, x, y, w, h }: { data: PostMortem['fairness']; x: number; y: number; w: number; h: number }) {
  const chartX = x + 40;
  const chartW = 380;
  const baseY = y + h - 46;
  const maxH = h - 130;
  const maxCount = Math.max(1, ...data.histogram.map((b) => b.count));
  const slot = chartW / data.histogram.length;

  return (
    <g>
      {data.histogram.map((b, i) => {
        const bh = (b.count / maxCount) * maxH;
        const bx = chartX + i * slot + slot * 0.16;
        const bw = slot * 0.68;
        return (
          <g key={b.label}>
            <rect x={bx} y={baseY - maxH} width={bw} height={maxH} rx={3} fill="#f4f6fa" />
            <rect
              x={bx}
              y={baseY - bh}
              width={bw}
              height={Math.max(b.count > 0 ? 2 : 0, bh)}
              rx={3}
              fill={b.label === '0' ? '#e0a3a3' : '#7f9fd8'}
            />
            <text x={bx + bw / 2} y={baseY - bh - 6} textAnchor="middle" fontSize={10.5} fill={C.ink2}>
              {b.count > 0 ? b.count : ''}
            </text>
            <text x={bx + bw / 2} y={baseY + 15} textAnchor="middle" fontSize={10.5} fill={C.ink3}>
              {b.label}
            </text>
          </g>
        );
      })}
      <text x={chartX + chartW / 2} y={baseY + 34} textAnchor="middle" fontSize={10} fill={C.ink3}>
        发言次数
      </text>

      {(() => {
        const rows = [
          { label: '零发言代表', value: `${data.silent} / ${data.total}`, note: fmtPct(data.silentRatio) },
          { label: '人均发言', value: `${data.avgSpeeches.toFixed(1)} 次`, note: `中位 ${data.medianSpeeches}` },
          { label: '发言时长基尼', value: data.gini.toFixed(2), note: data.gini > 0.6 ? '高度集中' : data.gini > 0.35 ? '偏集中' : '较均衡' },
          { label: '最多发言', value: `${data.maxSpeeches} 次`, note: `共 ${data.totalSpeeches} 次` },
        ];
        return rows.map((r, i) => (
          <g key={r.label}>
            <text x={x + 470} y={y + 72 + i * 46} fontSize={10.5} fill={C.ink3}>
              {r.label}
            </text>
            <text x={x + 470} y={y + 94 + i * 46} fontSize={16} fontWeight={700} fill={C.ink}>
              {r.value}
            </text>
            <text x={x + w - 24} y={y + 94 + i * 46} textAnchor="end" fontSize={10.5} fill={C.ink3}>
              {r.note}
            </text>
          </g>
        ));
      })()}

      <text x={x + 20} y={y + h - 12} fontSize={9.5} fill={C.ink3}>
        口径：上台发言与接受让渡各计一次，时长按该轮设定上限累计
      </text>
    </g>
  );
}

function TurnoutPanel({ data, x, y, w, h }: { data: PostMortem['turnout']; x: number; y: number; w: number; h: number }) {
  if (data.length === 0) {
    return (
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize={12} fill={C.ink3}>
        本场次还没有已公布的表决
      </text>
    );
  }

  const left = x + 46;
  const right = x + w - 30;
  const top = y + 70;
  const bottom = y + h - 52;
  const cw = right - left;
  const ch = bottom - top;
  const n = data.length;
  const px = (i: number) => (n === 1 ? left + cw / 2 : left + (i / (n - 1)) * cw);
  const py = (v: number) => bottom - v * ch;

  const line = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(p.turnout)}`).join(' ');
  const area = `${line} L${px(n - 1)},${bottom} L${px(0)},${bottom} Z`;

  return (
    <g>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={left} y1={py(t)} x2={right} y2={py(t)} stroke={C.line} strokeDasharray={t === 0 ? '' : '3 3'} />
          <text x={left - 8} y={py(t) + 3.5} textAnchor="end" fontSize={9.5} fill={C.ink3}>
            {t * 100}%
          </text>
        </g>
      ))}

      <path d={area} fill="#3b6fd4" fillOpacity={0.1} />
      <path d={line} fill="none" stroke={C.accent} strokeWidth={2} />

      {data.map((p, i) => (
        <g key={p.index}>
          <circle cx={px(i)} cy={py(p.turnout)} r={4} fill={p.result === 'passed' ? C.accent : C.bad} stroke="#fff" strokeWidth={1.5} />
          <text x={px(i)} y={bottom + 16} textAnchor="middle" fontSize={9.5} fill={C.ink3}>
            {p.index}
          </text>
          <text x={px(i)} y={py(p.turnout) - 10} textAnchor="middle" fontSize={9.5} fill={C.ink2}>
            {p.cast}
          </text>
        </g>
      ))}

      <text x={left + cw / 2} y={bottom + 34} textAnchor="middle" fontSize={10} fill={C.ink3}>
        第 n 次表决 · 数字为实际投票数
      </text>

      <g>
        <circle cx={x + 20} cy={y + h - 22} r={3.5} fill={C.accent} />
        <text x={x + 30} y={y + h - 18} fontSize={9.5} fill={C.ink3}>
          通过
        </text>
        <circle cx={x + 68} cy={y + h - 22} r={3.5} fill={C.bad} />
        <text x={x + 78} y={y + h - 18} fontSize={9.5} fill={C.ink3}>
          未通过
        </text>
      </g>
    </g>
  );
}

function conclusions(pm: PostMortem): string[] {
  const out: string[] = [];

  const time = pm.time.slices;
  const formal = time.find((s) => s.bucket === 'formal');
  const voting = time.find((s) => s.bucket === 'voting');
  if (pm.time.totalMs > 0) {
    out.push(
      `本场会议历时 ${fmtDuration(pm.time.totalMs)}，正式辩论占 ${fmtPct(formal?.share ?? 0)}，` +
        `表决程序占 ${fmtPct(voting?.share ?? 0)}。`,
    );
  }

  if (pm.motions.total > 0) {
    out.push(
      `共提出 ${pm.motions.total} 项动议，${pm.motions.decided} 项走完表决，通过率 ${fmtPct(pm.motions.passRate)}` +
        (pm.motions.avgDecisionMs > 0 ? `，从提出到裁定平均 ${fmtDuration(pm.motions.avgDecisionMs)}。` : '。'),
    );
  }

  if (pm.fairness.total > 0) {
    const g = pm.fairness.gini;
    const tone = g > 0.6 ? '参与高度集中，下一场次建议优先安排未发言国家。' : g > 0.35 ? '参与度偏集中，可再向沉默国家倾斜。' : '发言分布较为均衡。';
    out.push(
      `${pm.fairness.silent} 位代表（${fmtPct(pm.fairness.silentRatio)}）全程未发言，` +
        `发言时长基尼系数 ${g.toFixed(2)}，${tone}`,
    );
  }

  if (pm.turnout.length > 0) {
    const avg = pm.turnout.reduce((a, p) => a + p.turnout, 0) / pm.turnout.length;
    out.push(
      `共进行 ${pm.turnout.length} 次表决，平均出席率 ${fmtPct(avg)}，` +
        `其中 ${pm.turnout.filter((p) => p.result === 'passed').length} 次通过。`,
    );
  }

  return out;
}

export function PostMortemModal({ open, onClose, committee, session, state, events }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [busy, setBusy] = useState<'' | 'png' | 'pdf'>('');

  const pm = useMemo(
    () => (open ? buildPostMortem(state, events, committee.delegations) : null),
    [open, state, events, committee],
  );

  if (!open || !pm) return null;

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${committee.nameZh}-${session?.label ?? ''}-复盘-${stamp}`;

  const exportPng = async () => {
    if (!svgRef.current) return;
    setBusy('png');
    try {
      saveBlob(await svgToPng(svgRef.current, 2), `${base}.png`);
    } finally {
      setBusy('');
    }
  };

  const exportPdf = async () => {
    if (!svgRef.current) return;
    setBusy('pdf');
    try {
      saveBlob(await imageToPdf(await svgToPng(svgRef.current, 2)), `${base}.pdf`);
    } finally {
      setBusy('');
    }
  };

  const kpis = [
    { label: '会议时长', value: fmtDuration(pm.time.totalMs) },
    { label: '动议', value: String(pm.motions.total) },
    { label: '表决', value: String(pm.voteCount) },
    { label: '文件', value: String(pm.docCount) },
  ];

  const notes = conclusions(pm);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal pm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>会后复盘</h2>
          <span className="en">Session Post-Mortem</span>
          <span className="spacer" />
          <button className="ghost sm" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="modal-body pm-body">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg">
            <rect x={0} y={0} width={W} height={H} fill="#f7f8fa" />

            {/* 页眉 */}
            <text x={24} y={38} fontSize={20} fontWeight={700} fill={C.ink}>
              会后复盘
            </text>
            <text x={24} y={58} fontSize={10.5} fill={C.ink3}>
              {committee.nameZh} · {session?.label ?? '—'} · {stamp} · 共 {events.length} 条事件
            </text>
            {kpis.map((k, i) => (
              <g key={k.label}>
                <text x={780 + i * 110} y={28} fontSize={9.5} fill={C.ink3}>
                  {k.label}
                </text>
                <text x={780 + i * 110} y={50} fontSize={16} fontWeight={700} fill={C.ink}>
                  {k.value}
                </text>
              </g>
            ))}

            <Panel x={24} y={80} w={760} h={306} title="时间分配" en="Where the time went">
              <Sankey data={pm.time} x={24} y={80} w={760} h={306} />
            </Panel>

            <Panel x={800} y={80} w={416} h={306} title="动议统计" en="Motions">
              <MotionPanel data={pm.motions} x={800} y={80} w={416} h={306} />
            </Panel>

            <Panel x={24} y={402} w={760} h={306} title="参与公平性" en="Participation fairness">
              <FairnessPanel data={pm.fairness} x={24} y={402} w={760} h={306} />
            </Panel>

            <Panel x={800} y={402} w={416} h={306} title="出席率曲线" en="Turnout across votes">
              <TurnoutPanel data={pm.turnout} x={800} y={402} w={416} h={306} />
            </Panel>

            {/* 结论 */}
            <rect x={24} y={724} width={1192} height={132} rx={10} fill="#fff" stroke={C.line} />
            <text x={44} y={752} fontSize={13} fontWeight={700} fill={C.ink}>
              关键结论
            </text>
            {notes.map((t, i) => (
              <g key={i}>
                <circle cx={50} cy={776 + i * 24 - 4} r={2.5} fill={C.accent} />
                <text x={62} y={776 + i * 24} fontSize={11.5} fill={C.ink2}>
                  {t}
                </text>
              </g>
            ))}
            {notes.length === 0 && (
              <text x={62} y={776} fontSize={11.5} fill={C.ink3}>
                本场次数据不足，尚无结论
              </text>
            )}
          </svg>
        </div>

        <div className="modal-foot">
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            全部指标从事件流实时推导，与纪要、沉默雷达同源
          </span>
          <span style={{ flex: 1 }} />
          <button disabled={busy !== ''} onClick={() => void exportPng()}>
            {busy === 'png' ? '导出中…' : '导出 PNG'}
          </button>
          <button className="primary" disabled={busy !== ''} onClick={() => void exportPdf()}>
            {busy === 'pdf' ? '导出中…' : '导出 PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
