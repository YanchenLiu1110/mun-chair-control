import type { Delegation, VoteChoice, VoteMode, VoteRecord } from '../domain/types';
import { VOTE_CHOICE_SHORT, VOTE_MODE_LABEL, type VoteTally } from '../domain/voting';

interface Props {
  vote: VoteRecord;
  delegations: Delegation[];
  tally: VoteTally;
  onCast: (delegationId: string, choice: VoteChoice) => void;
  onMode: (mode: VoteMode) => void;
  onClose: () => void;
  onAbort: () => void;
}

const CHOICES: VoteChoice[] = ['yes', 'no', 'abstain', 'pass'];

const MODES: VoteMode[] = ['simple', 'two_thirds', 'veto'];

export function VoteBoard({
  vote,
  delegations,
  tally,
  onCast,
  onMode,
  onClose,
  onAbort,
}: Props) {
  const decided = tally.cast > 0;

  return (
    <section className="panel vote-board">
      <div className="panel-head">
        <h2>表决</h2>
        <span className="en">Voting</span>
        <span className="spacer" />
        <div className="mode-switch">
          {MODES.map((m) => (
            <button
              key={m}
              className={vote.mode === m ? 'on' : ''}
              onClick={() => onMode(m)}
              title={VOTE_MODE_LABEL[m]}
            >
              {m === 'simple' ? '简单多数' : m === 'two_thirds' ? '三分之二' : '五常否决'}
            </button>
          ))}
        </div>
      </div>

      <div className="vote-subject">{vote.titleZh || '表决事项'}</div>

      <div className="tally-strip">
        <div className="tally-cell yes">
          <div className="k">赞成</div>
          <div className="v num">{tally.yes}</div>
        </div>
        <div className="tally-cell no">
          <div className="k">反对</div>
          <div className="v num">{tally.no}</div>
        </div>
        <div className="tally-cell abstain">
          <div className="k">弃权</div>
          <div className="v num">{tally.abstain}</div>
        </div>
        <div className="tally-cell pass">
          <div className="k">过</div>
          <div className="v num">{tally.pass}</div>
        </div>
        <div className="tally-cell meta">
          <div className="k">分母 / 通过线</div>
          <div className="v num">
            {tally.basis}
            <small> / {tally.threshold}</small>
          </div>
        </div>
        <div className="tally-verdict">
          {decided ? (
            <span className={`verdict ${tally.passed ? 'ok' : 'bad'}`}>
              {tally.passed ? '通过' : '未通过'}
            </span>
          ) : (
            <span className="verdict">待投票</span>
          )}
          {tally.vetoedBy.length > 0 && (
            <div className="veto-note">
              被否决：{tally.vetoedBy.map((d) => d.shortZh).join('、')}
            </div>
          )}
        </div>
      </div>

      <div className="vote-grid">
        {delegations.map((d) => {
          const c = vote.ballots[d.id];
          return (
            <div className={`vote-cell${c ? ` cast-${c}` : ''}`} key={d.id}>
              <span className="flag">{d.flag}</span>
              <span className="nm" title={d.nameZh}>
                {d.shortZh}
              </span>
              {d.isP5 && <span className="p5">P5</span>}
              <span className="choices">
                {CHOICES.map((ch) => (
                  <button
                    key={ch}
                    className={c === ch ? `on on-${ch}` : ''}
                    onClick={() => onCast(d.id, ch)}
                    title={ch === 'yes' ? '赞成' : ch === 'no' ? '反对' : ch === 'abstain' ? '弃权' : '过'}
                  >
                    {VOTE_CHOICE_SHORT[ch]}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
      </div>

      <div className="panel-foot vote-foot">
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          已投 {tally.cast} / 出席 {vote.presentAtVote ?? '—'} · 分母只算赞成与反对
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={onAbort}>取消表决</button>
        <button className="primary" onClick={onClose}>
          关闭并公布结果
        </button>
      </div>
    </section>
  );
}
