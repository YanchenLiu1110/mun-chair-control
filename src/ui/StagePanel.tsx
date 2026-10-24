import { useEffect, useRef, useState } from 'react';
import { formatClock, remainingNow } from '../domain/timer';
import type { Delegation, Ruleset, SessionState, YieldTarget } from '../domain/types';
import { chimeExpire, chimeWarning, ensureAudio } from './audio';
import { useNow } from './useNow';

interface Props {
  state: SessionState;
  index: Map<string, Delegation>;
  delegations: Delegation[];
  ruleset: Ruleset;
  onStart: (durationSec: number) => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onExtend: (addSec: number) => void;
  onExpire: () => void;
  onYield: (target: YieldTarget, toDelegationId?: string) => void;
}

export function StagePanel({
  state,
  index,
  delegations,
  ruleset,
  onStart,
  onPause,
  onResume,
  onReset,
  onExtend,
  onExpire,
  onYield,
}: Props) {
  const now = useNow(200);
  const [sec, setSec] = useState(ruleset.defaultSpeechSec);
  const [yieldTo, setYieldTo] = useState(false);

  const floor = state.floor;
  const timer = floor.timer;
  const remaining = remainingNow(timer, now);
  const speaker = floor.speakingId ? index.get(floor.speakingId) : null;

  /**
   * 休会后讲台必须彻底锁死。大屏此时只画「休会」一屏，
   * 如果主席还能点「继续」，就会有一个谁看不见的时钟在后台跑，
   * 而且再点「休会」也停不掉它 —— 只能靠撤销。
   */
  const closed = state.phase === 'closed';

  /* ---- 提示音：只在跨越阈值的瞬间响一次 ---- */
  const prevRef = useRef(remaining);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = remaining;
    if (timer.status !== 'running') return;
    const warnMs = ruleset.warningSec * 1000;
    if (prev > warnMs && remaining <= warnMs && remaining > 0) chimeWarning();
    if (prev > 0 && remaining <= 0) chimeExpire();
  }, [remaining, timer.status, ruleset.warningSec]);

  /* ---- 归零自动记一条事件（每轮只记一次） ---- */
  const expireGuard = useRef<number | null>(null);
  useEffect(() => {
    if (timer.status === 'running' && remaining <= 0 && expireGuard.current !== timer.startedAt) {
      expireGuard.current = timer.startedAt;
      onExpire();
    }
  }, [remaining, timer.status, timer.startedAt, onExpire]);

  const ratio = timer.durationMs > 0 ? remaining / timer.durationMs : 0;
  const warnMs = ruleset.warningSec * 1000;
  const clockClass =
    remaining <= 0
      ? 'danger'
      : timer.status === 'paused'
        ? 'paused'
        : remaining <= warnMs
          ? 'warn'
          : '';
  const barClass = remaining <= 0 ? 'danger' : remaining <= warnMs ? 'warn' : '';

  const primaryLabel =
    timer.status === 'running' ? '暂停' : timer.status === 'paused' ? '继续' : '开始';

  const handlePrimary = () => {
    ensureAudio();
    if (timer.status === 'running') onPause();
    else if (timer.status === 'paused') onResume();
    else onStart(sec);
  };

  const yieldLabel = (() => {
    const y = floor.yield;
    if (!y) return null;
    if (y.target === 'chair') return '主席';
    if (y.target === 'delegate') return index.get(y.toDelegationId ?? '')?.shortZh ?? '代表';
    if (y.target === 'questions') return '问题';
    return '评论';
  })();

  const canYield = Boolean(floor.speakingId) && !floor.yieldUsed && !closed;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>讲台</h2>
        <span className="en">Floor</span>
        <span className="spacer" />
        <span className={`pill ${timer.status === 'running' && !closed ? 'ok' : ''}`}>
          {closed
            ? '已休会'
            : timer.status === 'running'
              ? '计时中'
              : timer.status === 'paused'
                ? '已暂停'
                : timer.status === 'expired'
                  ? '已归零'
                  : '待开始'}
        </span>
      </div>

      <div className="stage">
        <div className="stage-top">
          <div className="stage-kicker">Current Speaker · 当前发言</div>
          <div className="stage-speaker">
            {speaker ? (
              <>
                <span className="flag">{speaker.flag}</span>
                <div>
                  <div className="nm">{speaker.shortZh}</div>
                  <div className="nm-en">{speaker.nameEn}</div>
                </div>
              </>
            ) : (
              <span className="stage-empty">尚无发言代表</span>
            )}
          </div>
        </div>

        <div className="clock-wrap">
          <div className={`clock num ${clockClass}`}>{formatClock(remaining)}</div>
          <div className="clock-sub">
            {timer.extendedMs > 0 && `已加时 ${Math.round(timer.extendedMs / 1000)}s · `}
            本轮 {Math.round(timer.durationMs / 1000)}s
            {timer.status === 'running' && remaining > 0 && remaining <= warnMs
              ? ` · 剩余不足 ${ruleset.warningSec} 秒`
              : ''}
          </div>
          <div className="bar">
            <i className={barClass} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
          </div>
        </div>

        <div className="stage-controls">
          <button className="primary" onClick={handlePrimary} disabled={closed}>
            {primaryLabel}
          </button>
          <button onClick={onReset} disabled={closed || timer.status === 'idle'}>
            重置
          </button>
          <button onClick={() => onExtend(15)} disabled={closed}>
            +15s
          </button>
          <button onClick={() => onExtend(30)} disabled={closed}>
            +30s
          </button>
          <button onClick={onExpire} disabled={closed || timer.status !== 'running'}>
            结束
          </button>
        </div>

        <div className="stage-foot">
          <div className="yield-row">
            <span className="lbl">让渡 · Yield</span>
            {yieldLabel ? (
              <span className="yield-state">
                已让渡给 <b>{yieldLabel}</b>
                {floor.yieldUsed && ' · 本轮不可再次让渡'}
              </span>
            ) : (
              <>
                <button className="sm" disabled={!canYield} onClick={() => onYield('chair')}>
                  给主席
                </button>
                <button className="sm" disabled={!canYield} onClick={() => setYieldTo((v) => !v)}>
                  给代表
                </button>
                <button className="sm" disabled={!canYield} onClick={() => onYield('questions')}>
                  给问题
                </button>
                <button className="sm" disabled={!canYield} onClick={() => onYield('comments')}>
                  给评论
                </button>
              </>
            )}
          </div>

          {yieldTo && canYield && (
            <div className="yield-row" style={{ marginTop: 8 }}>
              <span className="lbl">接收方</span>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    onYield('delegate', e.target.value);
                    setYieldTo(false);
                  }
                }}
                style={{ flex: 1 }}
              >
                <option value="">选择接收让渡的代表…</option>
                {delegations
                  .filter((d) => d.id !== floor.speakingId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.flag} {d.shortZh}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="dur-row">
            <span className="lbl">发言时长</span>
            <input
              className="num"
              type="number"
              min={10}
              max={1200}
              value={sec}
              onChange={(e) => setSec(Math.max(10, Number(e.target.value) || 10))}
              disabled={closed || timer.status === 'running'}
            />
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>秒</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              提示音 {ruleset.warningSec}s · {ruleset.nameZh}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
