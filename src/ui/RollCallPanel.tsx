import { useMemo, useState } from 'react';
import type { QuorumInfo } from '../domain/derive';
import type { AttendanceStatus, Delegation } from '../domain/types';

interface Props {
  delegations: Delegation[];
  attendance: Record<string, AttendanceStatus>;
  quorum: QuorumInfo;
  onMark: (id: string, status: AttendanceStatus) => void;
  onMarkAll: (status: AttendanceStatus) => void;
  onReset: () => void;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '出席',
  present_voting: '票权',
  absent: '缺席',
};

export function RollCallPanel({ delegations, attendance, quorum, onMark, onMarkAll, onReset }: Props) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return delegations;
    return delegations.filter(
      (d) =>
        d.nameZh.toLowerCase().includes(kw) ||
        d.nameEn.toLowerCase().includes(kw) ||
        d.shortZh.toLowerCase().includes(kw),
    );
  }, [delegations, q]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>点名</h2>
        <span className="en">Roll Call</span>
        <span className="spacer" />
        <span className="pill">{quorum.present}/{quorum.total}</span>
      </div>

      <div className="quorum-grid">
        <div className="quorum-cell">
          <div className="k">出席</div>
          <div className="v">
            {quorum.present}
            <small>国</small>
          </div>
        </div>
        <div className="quorum-cell">
          <div className="k">出席并投票</div>
          <div className="v">
            {quorum.presentVoting}
            <small>国</small>
          </div>
        </div>
        <div className="quorum-cell hi">
          <div className="k">法定人数</div>
          <div className="v" style={{ color: quorum.quorumMet ? 'var(--ok)' : 'var(--danger)' }}>
            {quorum.quorum}
          </div>
        </div>
        <div className="quorum-cell">
          <div className="k">简单多数</div>
          <div className="v">{quorum.simpleMajority}</div>
        </div>
        <div className="quorum-cell">
          <div className="k">三分之二</div>
          <div className="v">{quorum.twoThirds}</div>
        </div>
        <div className="quorum-cell">
          <div className="k">20% 门槛</div>
          <div className="v">{quorum.motionThreshold}</div>
        </div>
      </div>

      <div className="rc-tools">
        <input
          placeholder="搜索国家 / Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="sm" onClick={() => onMarkAll('present_voting')} title="全部标记为出席并投票">
          全出席
        </button>
        <button className="sm ghost" onClick={onReset} title="清空全部点名结果">
          清空点名
        </button>
      </div>

      <div className="panel-body">
        {filtered.map((d) => {
          // 未点名的代表保持"未标记"外观，不预先显示为缺席
          const st = attendance[d.id];
          return (
            <div className="rc-row" key={d.id}>
              <span className="flag">{d.flag}</span>
              <span className="name" title={`${d.nameZh} / ${d.nameEn}`}>
                {d.shortZh}
              </span>
              {d.isP5 && <span className="p5">P5</span>}
              <div className="seg">
                {(['present', 'present_voting', 'absent'] as AttendanceStatus[]).map((s) => (
                  <button
                    key={s}
                    className={st === s ? `on-${s}` : ''}
                    onClick={() => onMark(d.id, s)}
                    title={
                      s === 'present'
                        ? '出席（无投票权）'
                        : s === 'present_voting'
                          ? '出席并投票'
                          : '缺席'
                    }
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="empty">没有匹配的国家</div>}
      </div>
    </section>
  );
}
