import { useCallback, useMemo, useState } from 'react';
import { computeQuorum } from '../domain/derive';
import { getRuleset } from '../domain/rulesets';
import type { AttendanceStatus, VoteMode, YieldTarget } from '../domain/types';
import { tallyVote } from '../domain/voting';
import { useSession } from '../store/sessionStore';
import { AgendaModal } from './AgendaModal';
import { BlocMap } from './BlocMap';
import { CaucusPanel } from './CaucusPanel';
import { ChairScript } from './ChairScript';
import { DocumentsPanel } from './DocumentsPanel';
import { GslPanel } from './GslPanel';
import { MinutesModal } from './MinutesModal';
import { MotionsPanel } from './MotionsPanel';
import { PostMortemModal } from './PostMortem';
import { RadarPanel } from './RadarPanel';
import { RollCallPanel } from './RollCallPanel';
import { StagePanel } from './StagePanel';
import { VoteBoard } from './VoteBoard';

const PHASE_LABEL: Record<string, string> = {
  idle: '未开场',
  rollcall: '点名中',
  agenda: '设定议题',
  debate: '正式辩论',
  moderated: '有主持磋商',
  unmoderated: '自由磋商',
  voting: '投票程序',
  closed: '已休会',
};

export function ChairConsole() {
  const {
    committee,
    sessions,
    activeSessionId,
    state,
    events,
    append,
    undo,
    exportJson,
    startSession,
    closeSession,
    backToPicker,
    openVote,
    closeVote,
  } = useSession();

  const [tab, setTab] = useState<'gsl' | 'motions' | 'docs'>('gsl');
  const [minutesOpen, setMinutesOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [blocOpen, setBlocOpen] = useState(false);
  const [pmOpen, setPmOpen] = useState(false);

  const index = useMemo(
    () => new Map((committee?.delegations ?? []).map((d) => [d.id, d])),
    [committee],
  );

  const ruleset = getRuleset(committee?.rulesetId ?? 'ga');

  const quorum = useMemo(() => {
    if (!state || !committee) return null;
    return computeQuorum(state, committee.delegations, ruleset);
  }, [state, committee, ruleset]);

  const tally = useMemo(() => {
    if (!state?.activeVote || !committee) return null;
    return tallyVote(state.activeVote, committee.delegations);
  }, [state, committee, ruleset]);

  const openProjection = useCallback(() => {
    const url = `${window.location.pathname}?view=projection`;
    window.open(url, 'mun-projection', 'width=1440,height=900');
  }, []);

  const handleExport = useCallback(async () => {
    const json = await exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mun-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [exportJson]);

  const handleClose = useCallback(async () => {
    if (!window.confirm('宣布休会？本场次将标记为「已结束」，三个计时器会一起停掉。\n\n休会不是删除：之后仍可在会期列表里重新打开，也可以用「撤销」退回来。')) return;
    await closeSession();
  }, [closeSession]);

  const handleBack = useCallback(async () => {
    if (state && state.phase !== 'closed') {
      if (!window.confirm('本场次还没有休会，确定返回会期列表？\n\n操作已实时保存，随时可以再打开继续。')) return;
    }
    await backToPicker();
  }, [backToPicker, state]);

  if (!committee || !state || !quorum) return null;

  const session = sessions.find((s) => s.id === activeSessionId);
  const pendingMotions = state.motions.filter((m) => m.status === 'pending').length;

  const markAll = (status: AttendanceStatus) =>
    append('rollcall/markAll', { status, delegationIds: committee.delegations.map((d) => d.id) });

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          {committee.nameZh}
          <span>{committee.nameEn}</span>
        </span>
        <span className="pill">{session?.label ?? '—'}</span>
        <span className="pill">{ruleset.nameZh}</span>
        <span className={`pill ${state.phase === 'closed' ? '' : 'info'}`}>
          {PHASE_LABEL[state.phase] ?? state.phase}
        </span>
        <button className="pill pill-btn" onClick={() => setAgendaOpen(true)}>
          {state.agenda ? `议题 · ${state.agenda.topicZh}` : '＋ 设定议题'}
        </button>
        <span className={`pill ${quorum.quorumMet ? 'ok' : 'bad'}`}>
          法定 {quorum.quorum} · 出席 {quorum.present}/{quorum.total} ·{' '}
          {quorum.quorumMet ? '已达成' : '未达成'}
        </span>
        <span className="spacer" />
        <button onClick={openProjection}>投影视图</button>
        <button className={blocOpen ? 'primary' : ''} onClick={() => setBlocOpen((v) => !v)}>
          阵营图谱
        </button>
        <button onClick={() => setMinutesOpen(true)}>会议纪要</button>
        <button onClick={() => setPmOpen(true)}>会后复盘</button>
        <button onClick={() => void handleBack()} title="回到会期列表（数据已自动保存）">
          会期列表
        </button>
        {state.phase === 'closed' ? (
          <button className="primary" onClick={() => void startSession()}>
            新会期
          </button>
        ) : (
          <button className="danger" onClick={() => void handleClose()} title="宣布休会，结束本场次">
            休会
          </button>
        )}
        <button onClick={() => void handleExport()}>导出 JSON</button>
        <button
          className="danger"
          disabled={events.length === 0}
          onClick={() => void undo()}
          title="撤销上一步操作（截断事件流尾部）"
        >
          撤销 {events.length > 0 && <span className="num">({events.length})</span>}
        </button>
      </header>

      {blocOpen ? (
        <BlocMap state={state} delegations={committee.delegations} index={index} />
      ) : (
      <main className="console">
        <RollCallPanel
          delegations={committee.delegations}
          attendance={state.attendance}
          quorum={quorum}
          onMark={(id, status) => void append('rollcall/marked', { delegationId: id, status })}
          onMarkAll={(status) => void markAll(status)}
          onReset={() => void append('rollcall/reset', {})}
        />

        <div className="center-col">
          {state.activeVote && tally ? (
            <VoteBoard
              vote={state.activeVote}
              delegations={committee.delegations}
              tally={tally}
              onCast={(delegationId, choice) => void append('vote/cast', { delegationId, choice })}
              onMode={(mode: VoteMode) => void append('vote/mode', { mode })}
              onClose={() => void closeVote()}
              onAbort={() => void append('vote/abort', {})}
            />
          ) : state.moderation.kind ? (
            <CaucusPanel
              moderation={state.moderation}
              delegations={committee.delegations}
              index={index}
              warningSec={ruleset.warningSec}
              onNext={() =>
                void append('caucus/next', {
                  delegationId: state.moderation.queue[0],
                  perSpeakerSec: state.moderation.perSpeakerSec,
                })
              }
              onEnqueue={(id) => void append('caucus/enqueue', { delegationId: id })}
              onDequeue={(id) => void append('caucus/dequeue', { delegationId: id })}
              onClose={() => void append('caucus/close', {})}
              onPause={(target) => void append('timer/pause', { target })}
              onResume={(target) => void append('timer/resume', { target })}
              onExtend={(target, addSec) => void append('timer/extend', { target, addSec })}
              onExpire={(target) => void append('timer/expire', { target })}
            />
          ) : (
            <StagePanel
              state={state}
              index={index}
              delegations={committee.delegations}
              ruleset={ruleset}
              quorum={quorum}
              onStart={(durationSec) =>
                void append('timer/start', { durationSec, speakerId: state.floor.speakingId })
              }
              onPause={() => void append('timer/pause', {})}
              onResume={() => void append('timer/resume', {})}
              onReset={() => void append('timer/reset', {})}
              onExtend={(addSec) => void append('timer/extend', { addSec })}
              onExpire={() => void append('timer/expire', {})}
              onYield={(target: YieldTarget, toDelegationId?: string) =>
                void append('yield/set', { target, toDelegationId })
              }
            />
          )}
          <ChairScript state={state} quorum={quorum} warningSec={ruleset.warningSec} />
        </div>

        <div className="right-col">
          <div className="tabbar">
            <button className={tab === 'gsl' ? 'on' : ''} onClick={() => setTab('gsl')}>
              名单
              <span className="tab-num">{state.gsl.order.length}</span>
            </button>
            <button className={tab === 'motions' ? 'on' : ''} onClick={() => setTab('motions')}>
              动议
              {pendingMotions > 0 && <span className="tab-num hot">{pendingMotions}</span>}
            </button>
            <button className={tab === 'docs' ? 'on' : ''} onClick={() => setTab('docs')}>
              文件
              <span className="tab-num">{state.documents.length}</span>
            </button>
          </div>

          {tab === 'gsl' && (
            <GslPanel
              delegations={committee.delegations}
              index={index}
              gsl={state.gsl}
              currentSpeaker={state.floor.speakingId}
              defaultSec={ruleset.defaultSpeechSec}
              onAdd={(id) => void append('gsl/add', { delegationId: id })}
              onRemove={(id) => void append('gsl/remove', { delegationId: id })}
              onMove={(from, to) => void append('gsl/move', { from, to })}
              onClear={() => void append('gsl/clear', {})}
              onAdvance={(durationSec) =>
                void append('gsl/advance', {
                  durationSec,
                  delegationId: state.gsl.order[state.gsl.currentIndex + 1],
                })
              }
            />
          )}

          {tab === 'motions' && (
            <MotionsPanel
              motions={state.motions}
              delegations={committee.delegations}
              index={index}
              ruleset={ruleset}
              onPropose={(p) => void append('motion/propose', p)}
              onStatus={(motionId, status) => void append('motion/status', { motionId, status })}
              onOpenVote={(motion, mode) =>
                void openVote({
                  subjectKind: 'motion',
                  subjectId: motion.id,
                  titleZh: `${motion.typeNameZh}${motion.topicZh ? ` · ${motion.topicZh}` : ''}`,
                  mode,
                })
              }
              onOpenCaucus={(m) =>
                void append('caucus/open', {
                  kind: m.typeId === 'unmoderated_caucus' ? 'unmoderated' : 'moderated',
                  topicZh: m.topicZh,
                  totalSec: m.totalSec || 600,
                  perSpeakerSec: m.perSpeakerSec || 60,
                })
              }
            />
          )}

          {tab === 'docs' && (
            <DocumentsPanel
              documents={state.documents}
              delegations={committee.delegations}
              index={index}
              onRegister={(p) => void append('doc/register', p)}
              onRole={(docId, delegationId, role, action) =>
                void append('doc/role', { docId, delegationId, role, action })
              }
              onPromote={(docId) => void append('doc/promote', { docId })}
              onStatus={(docId, status) => void append('doc/status', { docId, status })}
              onOpenVote={(doc, mode) =>
                void openVote({
                  subjectKind: 'document',
                  subjectId: doc.id,
                  titleZh: `${doc.code} ${doc.titleZh}`,
                  mode,
                })
              }
            />
          )}
        </div>

        <RadarPanel
          delegations={committee.delegations}
          index={index}
          events={events}
          gslOrder={state.gsl.order}
          onAddToGsl={(id) => void append('gsl/add', { delegationId: id })}
        />
      </main>
      )}

      <MinutesModal
        open={minutesOpen}
        onClose={() => setMinutesOpen(false)}
        committee={committee}
        session={session ?? null}
        ruleset={ruleset}
        state={state}
        events={events}
      />

      <AgendaModal
        open={agendaOpen}
        initial={state.agenda}
        onClose={() => setAgendaOpen(false)}
        onSave={(topicZh, topicEn) => void append('agenda/set', { topicZh, topicEn })}
      />

      <PostMortemModal
        open={pmOpen}
        onClose={() => setPmOpen(false)}
        committee={committee}
        session={session ?? null}
        state={state}
        events={events}
      />
    </div>
  );
}
