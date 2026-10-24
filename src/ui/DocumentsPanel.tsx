import { useMemo, useState } from 'react';
import { DOC_KIND_LABEL, DOC_STATUS_LABEL, docsOfKind, votingOrder } from '../domain/documents';
import type {
  Delegation,
  DocumentKind,
  DocumentRecord,
  VoteMode,
} from '../domain/types';

interface Props {
  documents: DocumentRecord[];
  delegations: Delegation[];
  index: Map<string, Delegation>;
  onRegister: (p: {
    kind: DocumentKind;
    titleZh: string;
    sponsors: string[];
    signatories: string[];
    parentId?: string;
  }) => void;
  onRole: (
    docId: string,
    delegationId: string,
    role: 'sponsor' | 'signatory',
    action: 'add' | 'remove',
  ) => void;
  onPromote: (docId: string) => void;
  onStatus: (docId: string, status: DocumentRecord['status']) => void;
  onOpenVote: (doc: DocumentRecord, mode: VoteMode) => void;
}

const KIND_ORDER: DocumentKind[] = ['working_paper', 'draft_resolution', 'amendment'];

const STATUS_CLASS: Record<DocumentRecord['status'], string> = {
  drafting: '',
  introduced: 'info',
  voting: 'info',
  passed: 'ok',
  failed: 'bad',
};

export function DocumentsPanel({
  documents,
  delegations,
  index,
  onRegister,
  onRole,
  onPromote,
  onStatus,
  onOpenVote,
}: Props) {
  const [kind, setKind] = useState<DocumentKind>('working_paper');
  const [title, setTitle] = useState('');
  const [sponsors, setSponsors] = useState<string[]>([]);
  const [signatories, setSignatories] = useState<string[]>([]);
  const [parentId, setParentId] = useState('');
  const [mode, setMode] = useState<VoteMode>('simple');

  const drafts = docsOfKind(documents, 'draft_resolution');
  const order = useMemo(() => votingOrder(documents), [documents]);

  const sorted = useMemo(() => {
    return [...documents].sort((a, b) => {
      const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
      return k !== 0 ? k : a.registeredAt - b.registeredAt;
    });
  }, [documents]);

  const addRole = (role: 'sponsor' | 'signatory', id: string) => {
    if (!id) return;
    if (role === 'sponsor') {
      setSponsors((s) => (s.includes(id) ? s : [...s, id]));
      setSignatories((s) => s.filter((x) => x !== id));
    } else {
      setSignatories((s) => (s.includes(id) ? s : [...s, id]));
      setSponsors((s) => s.filter((x) => x !== id));
    }
  };

  const submit = () => {
    if (!title.trim()) return;
    onRegister({
      kind,
      titleZh: title.trim(),
      sponsors,
      signatories,
      parentId: kind === 'amendment' && parentId ? parentId : undefined,
    });
    setTitle('');
    setSponsors([]);
    setSignatories([]);
    setParentId('');
  };

  const chipList = (
    ids: string[],
    docId: string | null,
    role: 'sponsor' | 'signatory',
  ) => (
    <div className="chips">
      {ids.length === 0 && <span className="chip-empty">—</span>}
      {ids.map((id) => (
        <span className="chip" key={id}>
          {index.get(id)?.flag} {index.get(id)?.shortZh ?? id}
          {docId && (
            <button onClick={() => onRole(docId, id, role, 'remove')} title="移除">
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>文件</h2>
        <span className="en">Documents</span>
        <span className="spacer" />
        <span className="pill">{documents.length} 份</span>
      </div>

      <div className="motion-form">
        <div className="mf-row">
          <select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {DOC_KIND_LABEL[k].zh}
              </option>
            ))}
          </select>
          <input
            placeholder="文件标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ flex: 2 }}
          />
        </div>

        {kind === 'amendment' && (
          <div className="mf-row">
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">关联决议草案…</option>
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} {d.titleZh}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="role-line">
          <span className="rl">起草国</span>
          {chipList(sponsors, null, 'sponsor')}
          <select value="" onChange={(e) => addRole('sponsor', e.target.value)}>
            <option value="">＋</option>
            {delegations
              .filter((d) => !sponsors.includes(d.id))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.flag} {d.shortZh}
                </option>
              ))}
          </select>
        </div>

        <div className="role-line">
          <span className="rl">附议国</span>
          {chipList(signatories, null, 'signatory')}
          <select value="" onChange={(e) => addRole('signatory', e.target.value)}>
            <option value="">＋</option>
            {delegations
              .filter((d) => !signatories.includes(d.id))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.flag} {d.shortZh}
                </option>
              ))}
          </select>
        </div>

        <button className="primary" style={{ width: '100%' }} onClick={submit} disabled={!title.trim()}>
          登记文件
        </button>
      </div>

      <div className="panel-body">
        {sorted.length === 0 && <div className="empty">暂无文件</div>}
        {sorted.map((d) => (
          <div className="doc-card" key={d.id}>
            <div className="dc-head">
              <span className="code">{d.code}</span>
              <span className="title" title={d.titleZh}>
                {d.titleZh}
              </span>
              <span className={`pill ${STATUS_CLASS[d.status]}`}>{DOC_STATUS_LABEL[d.status]}</span>
            </div>

            <div className="role-line compact">
              <span className="rl">起草</span>
              {chipList(d.sponsors, d.id, 'sponsor')}
              <select value="" onChange={(e) => onRole(d.id, e.target.value, 'sponsor', 'add')}>
                <option value="">＋</option>
                {delegations
                  .filter((x) => !d.sponsors.includes(x.id))
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.flag} {x.shortZh}
                    </option>
                  ))}
              </select>
            </div>

            <div className="role-line compact">
              <span className="rl">附议</span>
              {chipList(d.signatories, d.id, 'signatory')}
              <select value="" onChange={(e) => onRole(d.id, e.target.value, 'signatory', 'add')}>
                <option value="">＋</option>
                {delegations
                  .filter((x) => !d.signatories.includes(x.id))
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.flag} {x.shortZh}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mc-acts">
              {d.kind === 'working_paper' && (
                <button className="sm" onClick={() => onPromote(d.id)}>
                  升级为决议草案
                </button>
              )}
              {(d.kind === 'draft_resolution' || d.kind === 'amendment') &&
                d.status !== 'passed' &&
                d.status !== 'failed' &&
                d.status !== 'voting' && (
                  <button className="sm primary" onClick={() => onOpenVote(d, mode)}>
                    交付表决
                  </button>
                )}
              {d.status === 'voting' && <span className="mc-meta">表决进行中…</span>}
              {d.status === 'passed' && (
                <button className="sm ghost" onClick={() => onStatus(d.id, 'introduced')}>
                  撤销通过
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="panel-foot">
        <div className="dur-row" style={{ marginTop: 0 }}>
          <span className="lbl">表决模式</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as VoteMode)} style={{ flex: 1 }}>
            <option value="simple">简单多数</option>
            <option value="two_thirds">三分之二</option>
            <option value="veto">五常否决</option>
          </select>
        </div>
        <div className="vote-order">
          投票顺序：
          {order.length === 0 ? (
            <span className="chip-empty">暂无待表决文件</span>
          ) : (
            order.map((d, i) => (
              <span key={d.id} className="ord-item">
                {i + 1}. {d.code}
              </span>
            ))
          )}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>
          修正案先于其决议草案表决，同类按登记先后；工作文件不进入表决。
        </div>
      </div>
    </section>
  );
}
