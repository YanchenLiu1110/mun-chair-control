import { useEffect, useState } from 'react';
import type { Delegation, Motion, MotionCategory, Ruleset, ThresholdKind, VoteMode } from '../domain/types';

interface Props {
  motions: Motion[];
  delegations: Delegation[];
  index: Map<string, Delegation>;
  ruleset: Ruleset;
  onPropose: (p: {
    typeId: string;
    typeNameZh: string;
    category: MotionCategory;
    proposerId: string | null;
    topicZh: string;
    totalSec: number;
    perSpeakerSec: number;
    requiresVote: boolean;
    threshold: ThresholdKind;
  }) => void;
  onStatus: (motionId: string, status: Motion['status']) => void;
  onOpenVote: (motion: Motion, mode: VoteMode) => void;
  /** 磋商类动议通过后，主席一键把磋商开起来 */
  onOpenCaucus: (p: {
    typeId: string;
    topicZh: string;
    totalSec: number;
    perSpeakerSec: number;
  }) => void;
}

const STATUS_LABEL: Record<Motion['status'], string> = {
  pending: '待处理',
  voting: '表决中',
  passed: '通过',
  failed: '未通过',
  withdrawn: '已撤回',
  ruled: '已裁定',
};

const STATUS_CLASS: Record<Motion['status'], string> = {
  pending: '',
  voting: 'info',
  passed: 'ok',
  failed: 'bad',
  withdrawn: '',
  ruled: 'info',
};

const MODE_OPTIONS: Array<{ value: VoteMode; label: string }> = [
  { value: 'simple', label: '简单多数' },
  { value: 'two_thirds', label: '三分之二' },
  { value: 'veto', label: '五常否决' },
];

export function MotionsPanel({
  motions,
  delegations,
  index,
  ruleset,
  onPropose,
  onStatus,
  onOpenVote,
  onOpenCaucus,
}: Props) {
  const [typeId, setTypeId] = useState(ruleset.motionTypes[0]?.id ?? '');
  const [proposerId, setProposerId] = useState('');
  const [topicZh, setTopicZh] = useState('');
  const [totalSec, setTotalSec] = useState(600);
  const [perSpeakerSec, setPerSpeakerSec] = useState(60);
  const [mode, setMode] = useState<VoteMode>('simple');

  const def = ruleset.motionTypes.find((t) => t.id === typeId);

  useEffect(() => {
    if (!def) return;
    // 非计时类动议（如结束辩论、问题类）时长归零，避免沿用上一个类型的数值
    setTotalSec(def.defaultTotalSec ?? 0);
    setPerSpeakerSec(def.defaultPerSpeakerSec ?? 0);
  }, [def]);

  const submit = () => {
    if (!def) return;
    onPropose({
      typeId: def.id,
      typeNameZh: def.nameZh,
      category: def.category,
      proposerId: proposerId || null,
      topicZh: topicZh.trim(),
      totalSec,
      perSpeakerSec,
      requiresVote: def.requiresVote,
      threshold: def.threshold,
    });
    setTopicZh('');
  };

  const sorted = [...motions].reverse();

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>动议</h2>
        <span className="en">Motions</span>
        <span className="spacer" />
        <span className="pill">{motions.filter((m) => m.status === 'pending').length} 待处理</span>
      </div>

      <div className="motion-form">
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {ruleset.motionTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nameZh}
              {t.requiresVote ? '' : '（主席裁定）'}
            </option>
          ))}
        </select>

        <div className="mf-row">
          <select value={proposerId} onChange={(e) => setProposerId(e.target.value)}>
            <option value="">提出国…</option>
            {delegations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.flag} {d.shortZh}
              </option>
            ))}
          </select>
          <input
            placeholder={def?.category === 'inquiry' || def?.category === 'privilege' ? '说明（可选）' : '议题'}
            value={topicZh}
            onChange={(e) => setTopicZh(e.target.value)}
          />
        </div>

        {def?.defaultTotalSec !== undefined && (
          <div className="mf-row">
            <label className="mf-num">
              总时长
              <input
                className="num"
                type="number"
                min={30}
                value={totalSec}
                onChange={(e) => setTotalSec(Math.max(30, Number(e.target.value) || 30))}
              />
              s
            </label>
            {def.defaultPerSpeakerSec !== undefined && (
              <label className="mf-num">
                单人
                <input
                  className="num"
                  type="number"
                  min={10}
                  value={perSpeakerSec}
                  onChange={(e) => setPerSpeakerSec(Math.max(10, Number(e.target.value) || 10))}
                />
                s
              </label>
            )}
          </div>
        )}

        <button className="primary" style={{ width: '100%' }} onClick={submit}>
          提出动议
        </button>
      </div>

      <div className="panel-body">
        {sorted.length === 0 && <div className="empty">暂无动议</div>}
        {sorted.map((m) => {
          const proposer = m.proposerId ? index.get(m.proposerId) : null;
          return (
            <div className="motion-card" key={m.id}>
              <div className="mc-head">
                <span className="mc-type">{m.typeNameZh}</span>
                <span className={`pill ${STATUS_CLASS[m.status]}`}>{STATUS_LABEL[m.status]}</span>
              </div>
              <div className="mc-meta">
                <span>{proposer ? `${proposer.flag} ${proposer.shortZh}` : '未指定提出国'}</span>
                {m.topicZh && <span>· {m.topicZh}</span>}
                {m.totalSec > 0 && (
                  <span className="num">
                    · 总 {m.totalSec}s
                    {m.perSpeakerSec > 0 ? ` / 单人 ${m.perSpeakerSec}s` : ''}
                  </span>
                )}
              </div>
              {m.status === 'pending' && (
                <div className="mc-acts">
                  {m.requiresVote ? (
                    <>
                      <button className="sm primary" onClick={() => onOpenVote(m, mode)}>
                        交付表决
                      </button>
                      {m.typeId.includes('caucus') ? (
                        <button
                          className="sm"
                          onClick={() => {
                            // 主席宣布「无异议通过」并直接开庭，两个事件一气呵成
                            onStatus(m.id, 'passed');
                            onOpenCaucus({
                              typeId: m.typeId,
                              topicZh: m.topicZh,
                              totalSec: m.totalSec || 600,
                              perSpeakerSec: m.perSpeakerSec,
                            });
                          }}
                        >
                          通过并开启
                        </button>
                      ) : (
                        <button className="sm" onClick={() => onStatus(m.id, 'passed')}>
                          无异议通过
                        </button>
                      )}
                    </>
                  ) : (
                    <button className="sm primary" onClick={() => onStatus(m.id, 'ruled')}>
                      已裁定
                    </button>
                  )}
                  <button className="sm ghost" onClick={() => onStatus(m.id, 'withdrawn')}>
                    撤回
                  </button>
                </div>
              )}
              {m.status === 'voting' && <div className="mc-meta">表决进行中…</div>}
              {(m.status === 'passed' || m.status === 'ruled') && m.typeId.includes('caucus') && (
                <div className="mc-acts">
                  <button
                    className="sm primary"
                    onClick={() =>
                      onOpenCaucus({
                        typeId: m.typeId,
                        topicZh: m.topicZh,
                        totalSec: m.totalSec || 600,
                        perSpeakerSec: m.perSpeakerSec,
                      })
                    }
                  >
                    开始磋商
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="panel-foot">
        <div className="dur-row" style={{ marginTop: 0 }}>
          <span className="lbl">表决模式</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as VoteMode)} style={{ flex: 1 }}>
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 6 }}>
          {mode === 'simple' && '赞成 > 反对 即通过，弃权与「过」不计入分母'}
          {mode === 'two_thirds' && '赞成 ≥ ⌈2/3 × 赞成反对总数⌉ 即通过'}
          {mode === 'veto' && `先按简单多数，再叠加五常否决${ruleset.vetoEnabled ? '' : '（当前规则集未启用，仅作演示）'}`}
        </div>
      </div>
    </section>
  );
}
