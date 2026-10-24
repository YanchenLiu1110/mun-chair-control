import { useMemo, useState } from 'react';
import type { SessionEvent } from '../domain/events';
import type { ParticipationStat, RadarSort } from '../domain/participation';
import {
  buildRadar,
  computeParticipation,
  formatGap,
  RADAR_SORT_LABEL,
  sortRadar,
} from '../domain/participation';
import type { Delegation } from '../domain/types';
import { useNow } from './useNow';

interface Props {
  delegations: Delegation[];
  index: Map<string, Delegation>;
  events: SessionEvent[];
  gslOrder: string[];
  onAddToGsl: (id: string) => void;
}

const SORT_KEY = 'mun-chair/radar-sort/v1';

function loadSort(): RadarSort {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v === 'count' || v === 'duration' || v === 'gap') return v;
  } catch {
    /* ignore */
  }
  return 'count';
}

export function RadarPanel({ delegations, index, events, gslOrder, onAddToGsl }: Props) {
  const [sort, setSort] = useState<RadarSort>(loadSort);
  const now = useNow(20_000);

  const stats: Map<string, ParticipationStat> = useMemo(
    () => computeParticipation(events),
    [events],
  );

  const rows = useMemo(
    () => sortRadar(buildRadar(delegations.map((d) => d.id), stats, now), sort),
    [delegations, stats, sort, now],
  );

  const silentCount = rows.filter((r) => r.silent).length;
  const maxMs = Math.max(1, ...rows.map((r) => r.speechMs));
  const inList = new Set(gslOrder);

  return (
    <section className="panel radar">
      <div className="panel-head">
        <h2>沉默代表雷达</h2>
        <span className="en">Radar</span>
        <span style={{ flex: 1 }} />
        {silentCount > 0 && <span className="pill bad num">{silentCount} 未发言</span>}
      </div>

      <div className="radar-tools">
        <select
          value={sort}
          onChange={(e) => {
            const v = e.target.value as RadarSort;
            setSort(v);
            try {
              localStorage.setItem(SORT_KEY, v);
            } catch {
              /* ignore */
            }
          }}
        >
          {(Object.keys(RADAR_SORT_LABEL) as RadarSort[]).map((k) => (
            <option key={k} value={k}>
              按{RADAR_SORT_LABEL[k]}排序
            </option>
          ))}
        </select>
      </div>

      <div className="panel-body">
        {rows.map((r) => {
          const d = index.get(r.delegationId);
          const added = inList.has(r.delegationId);
          return (
            <div
              className={`radar-row${r.silent ? ' silent' : ''}${r.heavy ? ' heavy' : ''}`}
              key={r.delegationId}
              title={`${d?.nameZh ?? ''} · 发言 ${r.speeches} 次 · 累计 ${Math.round(
                r.speechMs / 1000,
              )}s · ${formatGap(r.gapMs)}`}
            >
              <span className="flag">{d?.flag}</span>
              <span className="nm">{d?.shortZh}</span>
              <span className="cnt num">{r.speeches}</span>
              <span className="bar-mini">
                <i style={{ width: `${Math.min(100, (r.speechMs / maxMs) * 100)}%` }} />
              </span>
              {sort === 'gap' ? (
                <span className="gap">{formatGap(r.gapMs)}</span>
              ) : (
                <button
                  className="add"
                  disabled={added}
                  onClick={() => onAddToGsl(r.delegationId)}
                  title={added ? '已在主发言名单中' : '加入主发言名单'}
                >
                  {added ? '✓' : '＋'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="radar-foot">
        <span className="lg lg-silent">零发言</span>
        <span className="lg lg-heavy">参与过高</span>
        <span style={{ flex: 1 }} />
        <span className="num">{rows.length} 国</span>
      </div>
    </section>
  );
}
