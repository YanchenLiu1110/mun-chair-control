import { useEffect, useRef } from 'react';
import { formatClock, remainingNow } from '../domain/timer';
import type { Delegation, ModerationState, TimerTarget } from '../domain/types';
import { chimeExpire, chimeWarning, ensureAudio } from './audio';
import { useNow } from './useNow';

interface Props {
  moderation: ModerationState;
  delegations: Delegation[];
  index: Map<string, Delegation>;
  warningSec: number;
  onNext: () => void;
  onEnqueue: (id: string) => void;
  onDequeue: (id: string) => void;
  onClose: () => void;
  onPause: (t: TimerTarget) => void;
  onResume: (t: TimerTarget) => void;
  onExtend: (t: TimerTarget, addSec: number) => void;
  onExpire: (t: TimerTarget) => void;
}

function TimerCard({
  title,
  en,
  remainingMs,
  totalMs,
  running,
  onPause,
  onResume,
  onExtend,
  warnSec,
}: {
  title: string;
  en: string;
  remainingMs: number;
  totalMs: number;
  running: boolean;
  onPause: () => void;
  onResume: () => void;
  onExtend: () => void;
  warnSec: number;
}) {
  const ratio = totalMs > 0 ? remainingMs / totalMs : 0;
  const cls = remainingMs <= 0 ? 'danger' : remainingMs <= warnSec * 1000 ? 'warn' : '';
  return (
    <div className="tmr-card">
      <div className="tmr-title">
        {title}
        <span className="en">{en}</span>
      </div>
      <div className={`tmr-clock num ${cls}`}>{formatClock(remainingMs)}</div>
      <div className="bar" style={{ width: '100%', marginTop: 8 }}>
        <i className={cls} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
      </div>
      <div className="tmr-acts">
        <button className="sm" onClick={running ? onPause : onResume}>
          {running ? '暂停' : '继续'}
        </button>
        <button className="sm" onClick={onExtend}>
          +30s
        </button>
      </div>
    </div>
  );
}

export function CaucusPanel({
  moderation,
  delegations,
  index,
  warningSec,
  onNext,
  onEnqueue,
  onDequeue,
  onClose,
  onPause,
  onResume,
  onExtend,
  onExpire,
}: Props) {
  const now = useNow(200);
  const isModerated = moderation.kind === 'moderated';

  const totalRemaining = remainingNow(moderation.totalTimer, now);
  const speakerRemaining = remainingNow(moderation.timer, now);

  /* 单人计时归零：提示音 + 记一条事件（每轮只记一次） */
  const prevRef = useRef(speakerRemaining);
  const guard = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = speakerRemaining;
    if (moderation.timer.status !== 'running') return;
    if (prev > warningSec * 1000 && speakerRemaining <= warningSec * 1000 && speakerRemaining > 0) {
      chimeWarning();
    }
    if (prev > 0 && speakerRemaining <= 0) {
      chimeExpire();
      if (guard.current !== moderation.timer.startedAt) {
        guard.current = moderation.timer.startedAt;
        onExpire('caucus_speaker');
      }
    }
  }, [speakerRemaining, moderation.timer.status, moderation.timer.startedAt, warningSec, onExpire]);

  const speaker = moderation.currentSpeaker ? index.get(moderation.currentSpeaker) : null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{isModerated ? '有主持核心磋商' : '自由磋商'}</h2>
        <span className="en">{isModerated ? 'Moderated Caucus' : 'Unmoderated Caucus'}</span>
        <span className="spacer" />
        <button className="danger sm" onClick={onClose}>
          结束磋商
        </button>
      </div>

      <div className="caucus-body">
        {moderation.topicZh && <div className="caucus-topic">议题 · {moderation.topicZh}</div>}

        <div className="tmr-grid">
          <TimerCard
            title="磋商总时长"
            en="Total"
            remainingMs={totalRemaining}
            totalMs={moderation.totalSec * 1000}
            running={moderation.totalTimer.status === 'running'}
            warnSec={60}
            onPause={() => onPause('caucus_total')}
            onResume={() => onResume('caucus_total')}
            onExtend={() => onExtend('caucus_total', 30)}
          />
          {isModerated && (
            <TimerCard
              title="单人发言"
              en="Per Speaker"
              remainingMs={speakerRemaining}
              totalMs={moderation.perSpeakerSec * 1000}
              running={moderation.timer.status === 'running'}
              warnSec={warningSec}
              onPause={() => onPause('caucus_speaker')}
              onResume={() => onResume('caucus_speaker')}
              onExtend={() => onExtend('caucus_speaker', 15)}
            />
          )}
        </div>

        {isModerated && (
          <div className="caucus-speaker">
            <div className="cs-label">当前发言 · On the floor</div>
            <div className="cs-row">
              {speaker ? (
                <>
                  <span className="cs-flag">{speaker.flag}</span>
                  <span className="cs-name">{speaker.shortZh}</span>
                </>
              ) : (
                <span className="cs-empty">队列为空，请添加代表</span>
              )}
              <span style={{ flex: 1 }} />
              <button
                className="primary"
                onClick={() => {
                  ensureAudio();
                  onNext();
                }}
                disabled={moderation.queue.length === 0}
              >
                下一位
              </button>
            </div>
          </div>
        )}

        {isModerated && (
          <div className="caucus-queue">
            <div className="cq-head">
              发言队列 <span className="num">{moderation.queue.length}</span>
              <span style={{ flex: 1 }} />
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) onEnqueue(e.target.value);
                }}
                style={{ maxWidth: 180 }}
              >
                <option value="">＋ 加入队列</option>
                {delegations
                  .filter(
                    (d) =>
                      !moderation.queue.includes(d.id) && d.id !== moderation.currentSpeaker,
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.flag} {d.shortZh}
                    </option>
                  ))}
              </select>
            </div>
            <div className="cq-list">
              {moderation.queue.length === 0 && <div className="empty">队列为空</div>}
              {moderation.queue.map((id, i) => {
                const d = index.get(id);
                return (
                  <div className="cq-item" key={id}>
                    <span className="idx">{i + 1}</span>
                    <span>{d?.flag}</span>
                    <span className="nm">{d?.shortZh ?? id}</span>
                    <button className="sm ghost" onClick={() => onDequeue(id)}>
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isModerated && (
          <div className="empty" style={{ paddingTop: 20 }}>
            自由磋商不计单人发言，只有总时长。
            <br />
            代表自由走动讨论，主席台只需盯住上方倒计时。
          </div>
        )}
      </div>
    </section>
  );
}
