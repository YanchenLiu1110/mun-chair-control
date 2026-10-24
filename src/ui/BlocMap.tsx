import { useEffect, useMemo, useState } from 'react';
import { buildBlocGraph, DEFAULT_BLOC_WEIGHTS, layoutGraph } from '../domain/bloc';
import type { BlocWeights } from '../domain/bloc';
import type { Delegation, SessionState } from '../domain/types';

interface Props {
  state: SessionState;
  delegations: Delegation[];
  index: Map<string, Delegation>;
}

const W_KEY = 'mun-chair/bloc-weights/v1';

function loadWeights(): BlocWeights {
  try {
    const raw = localStorage.getItem(W_KEY);
    if (!raw) return DEFAULT_BLOC_WEIGHTS;
    const w = JSON.parse(raw) as Partial<BlocWeights>;
    return {
      cosponsor: Number(w.cosponsor ?? DEFAULT_BLOC_WEIGHTS.cosponsor),
      vote: Number(w.vote ?? DEFAULT_BLOC_WEIGHTS.vote),
      motion: Number(w.motion ?? DEFAULT_BLOC_WEIGHTS.motion),
    };
  } catch {
    return DEFAULT_BLOC_WEIGHTS;
  }
}

const W_LABEL: Record<keyof BlocWeights, string> = {
  cosponsor: '共同起草 / 附议',
  vote: '表决立场一致',
  motion: '动议互相支持',
};

export function BlocMap({ state, delegations, index }: Props) {
  const [weights, setWeights] = useState<BlocWeights>(loadWeights);
  const [selected, setSelected] = useState<string | null>(null);
  const [topN, setTopN] = useState(5);

  useEffect(() => {
    try {
      localStorage.setItem(W_KEY, JSON.stringify(weights));
    } catch {
      /* ignore */
    }
  }, [weights]);

  const graph = useMemo(() => buildBlocGraph(state, weights), [state, weights]);
  const nodes = useMemo(
    () => layoutGraph(delegations.map((d) => d.id), graph.edges),
    [delegations, graph.edges],
  );

  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const maxStrength = Math.max(0.001, ...nodes.map((n) => n.strength));

  const highlight = useMemo(() => {
    if (!selected) return null;
    const allies = (graph.allies.get(selected) ?? []).slice(0, topN).map((a) => a.id);
    return { core: new Set([selected, ...allies]), selected };
  }, [selected, graph, topN]);

  const allyList = selected ? (graph.allies.get(selected) ?? []).slice(0, topN) : [];
  const signalCount = graph.edges.reduce(
    (acc, e) => ({ doc: acc.doc + (e.doc > 0 ? 1 : 0), vote: acc.vote + (e.vote > 0 ? 1 : 0), motion: acc.motion + (e.motion > 0 ? 1 : 0) }),
    { doc: 0, vote: 0, motion: 0 },
  );

  return (
    <div className="bloc-view">
      <div className="bloc-canvas">
        <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid meet">
          <g>
            {graph.edges.map((e) => {
              const a = pos.get(e.a);
              const b = pos.get(e.b);
              if (!a || !b) return null;
              const dim = highlight && !(highlight.core.has(e.a) && highlight.core.has(e.b));
              return (
                <line
                  key={`${e.a}-${e.b}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={dim ? '#c9d1de' : '#5b7fd4'}
                  strokeWidth={0.4 + e.w * 2.2}
                  strokeOpacity={dim ? 0.12 : 0.16 + Math.min(0.6, e.w * 0.6)}
                />
              );
            })}
          </g>
          <g>
            {nodes.map((n) => {
              const d = index.get(n.id);
              const isCore = highlight ? highlight.core.has(n.id) : true;
              const isSel = highlight?.selected === n.id;
              const isLonely = n.strength === 0;
              const r = 5 + (n.strength / maxStrength) * 8;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  style={{ cursor: 'pointer' }}
                  opacity={isCore ? 1 : 0.22}
                  onClick={() => setSelected((prev) => (prev === n.id ? null : n.id))}
                >
                  <circle
                    r={r}
                    fill={isSel ? '#1d4ed8' : isLonely ? '#c6cdd9' : isCore ? '#3b6fd4' : '#9aa6b8'}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                  <text
                    x={0}
                    y={r + 11}
                    textAnchor="middle"
                    fontSize={isCore ? 10.5 : 9.5}
                    fontWeight={isSel ? 700 : 500}
                    fill={isSel ? '#1d4ed8' : isLonely ? '#98a1b0' : isCore ? '#14171d' : '#8b93a2'}
                  >
                    {d?.shortZh ?? n.id}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {graph.edges.length === 0 && (
          <div className="bloc-empty">
            还没有足够的关系数据
            <br />
            登记一批共同起草国，或完成一次表决后，图谱会自动成形
          </div>
        )}
      </div>

      <aside className="bloc-side">
        <div className="bs-block">
          <div className="bs-title">权重系数</div>
          {(Object.keys(W_LABEL) as Array<keyof BlocWeights>).map((k) => (
            <label className="bs-slider" key={k}>
              <span className="bs-slider-label">
                {W_LABEL[k]}
                <b className="num">{weights[k].toFixed(1)}</b>
              </span>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={weights[k]}
                onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
              />
            </label>
          ))}
          <button className="sm ghost" onClick={() => setWeights(DEFAULT_BLOC_WEIGHTS)}>
            恢复默认
          </button>
        </div>

        <div className="bs-block">
          <div className="bs-title">图谱规模</div>
          <div className="bs-stats num">
            <span>{nodes.length} 国</span>
            <span>{graph.edges.length} 条边</span>
          </div>
          <div className="bs-legend">
            含共同起草 {signalCount.doc} 条 · 表决一致 {signalCount.vote} 条 · 动议支持{' '}
            {signalCount.motion} 条
          </div>
          {nodes.some((n) => n.strength === 0) && (
            <div className="bs-legend">
              外圈浅灰节点 = 尚未与他国产生关联（
              {nodes.filter((n) => n.strength === 0).length} 国）
            </div>
          )}
        </div>

        <div className="bs-block bs-allies">
          <div className="bs-title">
            最亲近的盟友
            <select
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              style={{ marginLeft: 'auto' }}
            >
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  前 {n}
                </option>
              ))}
            </select>
          </div>
          {!selected && <div className="bs-hint">点击任一国家节点，高亮其最亲近的盟友</div>}
          {selected && (
            <>
              <div className="bs-selected">
                {index.get(selected)?.flag} {index.get(selected)?.shortZh}
              </div>
              {allyList.length === 0 && <div className="bs-hint">暂无可计算的关系</div>}
              {allyList.map((a, i) => (
                <div className="bs-ally" key={a.id}>
                  <span className="num rank">{i + 1}</span>
                  <span className="flag">{index.get(a.id)?.flag}</span>
                  <span className="nm">{index.get(a.id)?.shortZh ?? a.id}</span>
                  <span className="bar-mini">
                    <i style={{ width: `${Math.min(100, a.w * 100)}%` }} />
                  </span>
                  <span className="num w">{a.w.toFixed(2)}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="bs-note">
          亲疏度 = 三类信号各自归一化后加权求和。边越粗越亮，关系越近。
        </div>
      </aside>
    </div>
  );
}
