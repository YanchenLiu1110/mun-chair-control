import { useMemo, useState } from 'react';
import type { Delegation, GslState } from '../domain/types';

interface Props {
  delegations: Delegation[];
  index: Map<string, Delegation>;
  gsl: GslState;
  currentSpeaker: string | null;
  defaultSec: number;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onClear: () => void;
  onAdvance: (durationSec: number) => void;
}

export function GslPanel({
  delegations,
  index,
  gsl,
  currentSpeaker,
  defaultSec,
  onAdd,
  onRemove,
  onMove,
  onClear,
  onAdvance,
}: Props) {
  const [sec, setSec] = useState(defaultSec);

  const available = useMemo(() => {
    const inList = new Set(gsl.order);
    return delegations.filter((d) => !inList.has(d.id));
  }, [delegations, gsl.order]);

  const atEnd = gsl.currentIndex + 1 >= gsl.order.length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>主发言名单</h2>
        <span className="en">GSL</span>
        <span className="spacer" />
        <span className="pill info">{gsl.order.length} 国</span>
        {gsl.order.length > 0 && (
          <button className="sm ghost" onClick={onClear}>
            清空
          </button>
        )}
      </div>

      <div className="rc-tools">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value);
          }}
          style={{ flex: 1 }}
        >
          <option value="">＋ 添加代表到名单…</option>
          {available.map((d) => (
            <option key={d.id} value={d.id}>
              {d.flag} {d.shortZh}
            </option>
          ))}
        </select>
      </div>

      <div className="panel-body">
        {gsl.order.length === 0 && (
          <div className="empty">
            名单为空
            <br />
            从上方选择代表加入
          </div>
        )}
        <div className="gsl-list">
          {gsl.order.map((id, i) => {
            const d = index.get(id);
            const isCurrent = id === currentSpeaker;
            const isDone = i < gsl.currentIndex;
            return (
              <div
                key={id}
                className={`gsl-row${isCurrent ? ' current' : ''}${isDone ? ' done' : ''}`}
              >
                <span className="idx">{i + 1}</span>
                <span className="flag">{d?.flag ?? '🏳️'}</span>
                <span className="nm">{d?.shortZh ?? id}</span>
                <span className="acts">
                  <button disabled={i === 0} onClick={() => onMove(i, i - 1)} title="上移">
                    ↑
                  </button>
                  <button
                    disabled={i === gsl.order.length - 1}
                    onClick={() => onMove(i, i + 1)}
                    title="下移"
                  >
                    ↓
                  </button>
                  <button onClick={() => onRemove(id)} title="移出名单">
                    ×
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel-foot">
        <div className="dur-row" style={{ marginTop: 0 }}>
          <span className="lbl">发言时长</span>
          <input
            className="num"
            type="number"
            min={10}
            max={1200}
            value={sec}
            onChange={(e) => setSec(Math.max(10, Number(e.target.value) || 10))}
          />
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>秒 / 人</span>
          <span className="spacer" style={{ flex: 1 }} />
        </div>
        <button
          className="primary"
          style={{ width: '100%', marginTop: 8, padding: '8px 0' }}
          disabled={atEnd}
          onClick={() => onAdvance(sec)}
        >
          {atEnd ? '名单已结束' : `下一位发言 · ${sec}s`}
        </button>
      </div>
    </section>
  );
}
