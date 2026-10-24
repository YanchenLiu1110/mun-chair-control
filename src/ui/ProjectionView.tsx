import { useEffect, useState } from 'react';
import { getRuleset } from '../domain/rulesets';
import { formatClock, remainingNow } from '../domain/timer';
import type { Delegation, VoteChoice, VoteRecord } from '../domain/types';
import type { SyncPayload } from '../store/sync';
import { requestSync, subscribe } from '../store/sync';
import { useNow } from './useNow';

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

const VOTE_MODE_LABEL: Record<string, string> = {
  simple: '简单多数',
  two_thirds: '三分之二多数',
  veto: '五常否决',
};

function countBallots(v: VoteRecord): Record<VoteChoice, number> {
  const c: Record<VoteChoice, number> = { yes: 0, no: 0, abstain: 0, pass: 0 };
  for (const choice of Object.values(v.ballots)) c[choice] += 1;
  return c;
}

/** 结果页停留时长：给大屏足够时间让全场看到 */
const RESULT_HOLD_MS = 15_000;

/**
 * 投影视图：独立窗口，只读镜像。
 *
 * 不连数据库、不发事件、不出声 —— 时钟由本地 Date.now() 与主窗口广播的
 * startedAt 基准共同推算，所以主窗口卡顿或短暂失联都不会让大屏时间漂移。
 *
 * 三种画面按当前状态自动切换：表决 > 磋商 > 正式发言；
 * 表决刚结束的 15 秒内继续显示结果，主席不用另外再切一屏。
 */
export function ProjectionView() {
  const [payload, setPayload] = useState<SyncPayload | null>(null);
  const [lastAt, setLastAt] = useState(0);
  const now = useNow(200);

  useEffect(() => {
    const unsub = subscribe((p) => {
      setPayload(p);
      setLastAt(Date.now());
    });
    requestSync();
    const poll = window.setInterval(requestSync, 2500);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, []);

  if (!payload) {
    return (
      <div className="proj">
        <div className="proj-main">
          <div className="proj-idle">等待主席台连接…</div>
          <div style={{ marginTop: 14, color: 'var(--ink-3)', fontSize: 13 }}>
            请保持主席台窗口处于打开状态
          </div>
        </div>
      </div>
    );
  }

  const { committee, state } = payload;
  const ruleset = getRuleset(committee.rulesetId);
  const index = new Map<string, Delegation>(committee.delegations.map((d) => [d.id, d]));

  // 心跳：主窗口每 2.5 秒应答一次，超过 8 秒没有任何消息就认为断线
  const age = lastAt ? now - lastAt : 0;
  const link = age > 8000 ? 'down' : age > 4000 ? 'slow' : 'ok';

  const lastVote = state.votes[state.votes.length - 1];
  const resultHold =
    !state.activeVote && lastVote?.closedAt != null && now - lastVote.closedAt < RESULT_HOLD_MS;

  const mode: 'closed' | 'vote' | 'result' | 'caucus' | 'floor' =
    state.phase === 'closed'
      ? 'closed'
      : state.activeVote
        ? 'vote'
        : resultHold
          ? 'result'
          : state.moderation.kind
            ? 'caucus'
            : 'floor';

  const presentCount = Object.values(state.attendance).filter((s) => s !== 'absent').length;

  /* ---------------- 正式发言 ---------------- */
  const floorTimer = state.floor.timer;
  const floorRemaining = remainingNow(floorTimer, now);
  const speaker = state.floor.speakingId ? index.get(state.floor.speakingId) : null;
  const nextId = state.gsl.order[state.gsl.currentIndex + 1];
  const next = nextId ? index.get(nextId) : null;

  /* ---------------- 磋商 ---------------- */
  const caucus = state.moderation;
  const caucusSpeaker = caucus.currentSpeaker ? index.get(caucus.currentSpeaker) : null;
  const perRemaining = remainingNow(caucus.timer, now);
  const totalRemaining = remainingNow(caucus.totalTimer, now);

  /* ---------------- 表决 ---------------- */
  const vote = state.activeVote;
  const voteCounts = vote ? countBallots(vote) : null;
  const voteCast = voteCounts
    ? voteCounts.yes + voteCounts.no + voteCounts.abstain + voteCounts.pass
    : 0;
  const voteBase = vote?.presentAtVote ?? presentCount;

  const yieldText = (() => {
    const y = state.floor.yield;
    if (!y) return null;
    if (y.target === 'chair') return '让渡主席';
    if (y.target === 'delegate') return `让渡 ${index.get(y.toDelegationId ?? '')?.shortZh ?? '代表'}`;
    if (y.target === 'questions') return '让渡问题';
    return '让渡评论';
  })();

  const bigClock = (remaining: number, status: string) => {
    const cls =
      remaining <= 0 ? 'danger' : status === 'paused' ? 'paused' : remaining <= 30_000 ? 'warn' : '';
    return <div className={`proj-clock num ${cls}`}>{formatClock(remaining)}</div>;
  };

  const progressBar = (remaining: number, total: number) => {
    const ratio = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
    return (
      <div className="proj-bar">
        <i
          style={{
            width: `${ratio * 100}%`,
            background:
              remaining <= 0 ? 'var(--danger)' : remaining <= 30_000 ? '#dc6803' : 'var(--accent)',
          }}
        />
      </div>
    );
  };

  return (
    <div className="proj">
      <header className="proj-head">
        <div className="cm">
          {committee.nameZh}
          <small>{committee.nameEn}</small>
        </div>
        <span className="pill">{state.meta.label}</span>
        <span className="spacer" />
        {state.agenda && (
          <span className="pill info" title={state.agenda.topicEn}>
            议题 · {state.agenda.topicZh}
          </span>
        )}
        <span className="pill">{PHASE_LABEL[state.phase] ?? state.phase}</span>
        <span className={`proj-link ${link}`} title={link === 'down' ? '主席台已断开' : '已连接'}>
          <i />
          {link === 'ok' ? '已连接' : link === 'slow' ? '延迟' : '已断开'}
        </span>
        <button
          className="proj-fs"
          title="全屏"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen();
          }}
        >
          ⛶
        </button>
      </header>

      <main className="proj-main">
        {mode === 'closed' && (
          <>
            <div className="proj-kicker">Session Closed</div>
            <div className="proj-result neutral">
              休会
              <small>ADJOURNED</small>
            </div>
            <div className="proj-sub">
              {state.meta.label}
              {state.agenda ? ` · ${state.agenda.topicZh}` : ''}
            </div>
          </>
        )}

        {mode === 'vote' && vote && voteCounts && (
          <>
            <div className="proj-kicker">Voting · 表决</div>
            <div className="proj-vote-title">{vote.titleZh}</div>
            <div className="proj-tally">
              <div className="pt yes">
                <b className="num">{voteCounts.yes}</b>
                <span>赞成 Yes</span>
              </div>
              <div className="pt no">
                <b className="num">{voteCounts.no}</b>
                <span>反对 No</span>
              </div>
              <div className="pt abstain">
                <b className="num">{voteCounts.abstain}</b>
                <span>弃权 Abstain</span>
              </div>
              <div className="pt pass">
                <b className="num">{voteCounts.pass}</b>
                <span>未投 Pass</span>
              </div>
            </div>
            <div className="proj-vote-meta">
              已投 {voteCast} / {voteBase} · {VOTE_MODE_LABEL[vote.mode] ?? vote.mode}
            </div>
            <div className="proj-bar">
              <i
                style={{
                  width: `${voteBase > 0 ? Math.min(100, (voteCast / voteBase) * 100) : 0}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
          </>
        )}

        {mode === 'result' && lastVote && (
          <>
            <div className="proj-kicker">Result · 表决结果</div>
            <div className={`proj-result ${lastVote.result === 'passed' ? 'pass' : 'fail'}`}>
              {lastVote.result === 'passed' ? '通过' : '未通过'}
              <small>{lastVote.result === 'passed' ? 'ADOPTED' : 'REJECTED'}</small>
            </div>
            <div className="proj-vote-title">{lastVote.titleZh}</div>
            <div className="proj-tally compact">
              <div className="pt yes">
                <b className="num">{lastVote.counts?.yes ?? 0}</b>
                <span>赞成</span>
              </div>
              <div className="pt no">
                <b className="num">{lastVote.counts?.no ?? 0}</b>
                <span>反对</span>
              </div>
              <div className="pt abstain">
                <b className="num">{lastVote.counts?.abstain ?? 0}</b>
                <span>弃权</span>
              </div>
            </div>
            {lastVote.vetoedBy && lastVote.vetoedBy.length > 0 && (
              <div className="proj-veto">
                被否决：{lastVote.vetoedBy.map((id) => index.get(id)?.shortZh ?? id).join('、')}
              </div>
            )}
          </>
        )}

        {mode === 'caucus' && (
          <>
            <div className="proj-kicker">
              {caucus.kind === 'moderated' ? 'Moderated Caucus · 有主持核心磋商' : 'Unmoderated Caucus · 自由磋商'}
            </div>
            {caucus.topicZh && <div className="proj-vote-title">{caucus.topicZh}</div>}
            {caucusSpeaker ? (
              <div className="proj-speaker">
                <span className="flag">{caucusSpeaker.flag}</span>
                <div>
                  <div className="nm">{caucusSpeaker.shortZh}</div>
                  <div className="nm-en">{caucusSpeaker.nameEn}</div>
                </div>
              </div>
            ) : (
              <div className="proj-idle">等待下一位发言</div>
            )}
            {caucus.kind === 'moderated' ? (
              <>
                {bigClock(perRemaining, caucus.timer.status)}
                {progressBar(perRemaining, caucus.timer.durationMs)}
              </>
            ) : (
              <>
                {bigClock(totalRemaining, caucus.totalTimer.status)}
                {progressBar(totalRemaining, caucus.totalTimer.durationMs)}
              </>
            )}
            <div className="proj-sub">
              磋商剩余 <b className="num">{formatClock(totalRemaining)}</b>
              <span className="sep">·</span>
              队列 <b className="num">{caucus.queue.length}</b> 人
            </div>
          </>
        )}

        {mode === 'floor' && (
          <>
            <div className="proj-kicker">Current Speaker</div>
            {speaker ? (
              <div className="proj-speaker">
                <span className="flag">{speaker.flag}</span>
                <div>
                  <div className="nm">{speaker.shortZh}</div>
                  <div className="nm-en">{speaker.nameEn}</div>
                </div>
              </div>
            ) : (
              <div className="proj-idle">请主席台指定发言代表</div>
            )}
            {bigClock(floorRemaining, floorTimer.status)}
            {progressBar(floorRemaining, floorTimer.durationMs)}
          </>
        )}
      </main>

      <footer className="proj-foot">
        {mode === 'closed' ? (
          <>
            <div>
              <span className="k">Topic · 议题</span>
              <span className="v">{state.agenda?.topicZh ?? '—'}</span>
            </div>
            <div>
              <span className="k">Motions · 动议</span>
              <span className="v num">{state.motions.length}</span>
            </div>
            <div>
              <span className="k">Documents · 文件</span>
              <span className="v num">{state.documents.length}</span>
            </div>
          </>
        ) : mode === 'vote' || mode === 'result' ? (
          <>
            <div>
              <span className="k">Subject · 表决对象</span>
              <span className="v">{lastVote?.titleZh ?? vote?.titleZh ?? '—'}</span>
            </div>
            <div>
              <span className="k">Cast · 已投</span>
              <span className="v num">
                {mode === 'vote' ? voteCast : (lastVote?.counts ? lastVote.counts.yes + lastVote.counts.no + lastVote.counts.abstain + lastVote.counts.pass : 0)} /{' '}
                {voteBase}
              </span>
            </div>
            <div>
              <span className="k">Majority · 通过门槛</span>
              <span className="v">
                {ruleset.majorityBasis === 'present' ? '出席过半' : '出席并投票过半'}
              </span>
            </div>
          </>
        ) : mode === 'caucus' ? (
          <>
            <div>
              <span className="k">Topic · 议题</span>
              <span className="v">{caucus.topicZh || '—'}</span>
            </div>
            <div>
              <span className="k">Queue · 队列</span>
              <span className="v num">{caucus.queue.length} 人</span>
            </div>
            <div>
              <span className="k">Per Speaker · 单人限时</span>
              <span className="v num">{caucus.perSpeakerSec > 0 ? `${caucus.perSpeakerSec}s` : '不限'}</span>
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="k">Next · 下一位</span>
              <span className="v">{next ? `${next.flag} ${next.shortZh}` : '—'}</span>
            </div>
            <div>
              <span className="k">On Floor · 讲台</span>
              <span className="v">
                {yieldText ??
                  (floorTimer.status === 'running'
                    ? '发言中'
                    : floorTimer.status === 'paused'
                      ? '暂停'
                      : '待开始')}
              </span>
            </div>
            <div>
              <span className="k">GSL · 名单</span>
              <span className="v num">
                {state.gsl.order.length > 0
                  ? `${Math.max(0, state.gsl.currentIndex + 1)} / ${state.gsl.order.length}`
                  : '—'}
              </span>
            </div>
          </>
        )}
        <span style={{ flex: 1 }} />
        <div>
          <span className="k">Quorum · 出席</span>
          <span className="v num">
            {presentCount} / {committee.delegations.length}
          </span>
        </div>
      </footer>
    </div>
  );
}
