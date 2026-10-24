import { useState } from 'react';
import { seedDelegations } from '../domain/delegations';
import { RULESETS } from '../domain/rulesets';
import type { Delegation } from '../domain/types';
import { useSession } from '../store/sessionStore';
import { RosterEditor } from './RosterEditor';

/** 首次使用：建立委员会与名册 */
export function SetupScreen() {
  const createCommittee = useSession((s) => s.createCommittee);
  const [nameZh, setNameZh] = useState('联合国大会第一委员会');
  const [nameEn, setNameEn] = useState('GA First Committee · DISEC');
  const [rulesetId, setRulesetId] = useState('ga');
  const [delegations, setDelegations] = useState<Delegation[]>(() => seedDelegations());
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!nameZh.trim() || busy || delegations.length === 0) return;
    setBusy(true);
    await createCommittee({
      nameZh: nameZh.trim(),
      nameEn: nameEn.trim(),
      rulesetId,
      delegations,
    });
    setBusy(false);
  };

  return (
    <div className="setup">
      <div className="setup-card wide">
        <h1>主席台工作台</h1>
        <div className="sub">Chair Console · 本地运行，数据只存在这台电脑的浏览器里</div>

        <div className="row2">
          <div className="field">
            <label>委员会名称（中文）</label>
            <input
              value={nameZh}
              onChange={(e) => setNameZh(e.target.value)}
              placeholder="如：联合国大会第一委员会"
            />
          </div>
          <div className="field">
            <label>委员会名称（英文）</label>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="如：GA First Committee"
            />
          </div>
        </div>

        <div className="field">
          <label>议事规则集</label>
          <select value={rulesetId} onChange={(e) => setRulesetId(e.target.value)}>
            {RULESETS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameZh}
              </option>
            ))}
          </select>
        </div>

        <RosterEditor value={delegations} onChange={setDelegations} />

        <div className="hint" style={{ marginTop: 12 }}>
          规则集决定动议类型、表决门槛、默认发言时长与五常否决权；名册决定点名表、法定人数与图谱节点。
        </div>

        <button
          className="primary"
          style={{ width: '100%', padding: '9px 0', marginTop: 14 }}
          onClick={() => void submit()}
          disabled={busy || delegations.length === 0}
        >
          {busy ? '正在创建…' : `创建委员会（${delegations.length} 席）`}
        </button>
      </div>
    </div>
  );
}

/** 已有委员会但未进入场次：选会期 */
export function SessionPicker() {
  const { committee, sessions, startSession, selectSession, updateRoster, resetAll } = useSession();
  const [rosterOpen, setRosterOpen] = useState(false);
  const [draft, setDraft] = useState<Delegation[]>([]);
  if (!committee) return null;

  const locked = sessions.length > 0;

  return (
    <div className="setup">
      <div className="setup-card wide">
        <h1>{committee.nameZh}</h1>
        <div className="sub">
          {committee.nameEn} · {committee.delegations.length} 席代表
        </div>

        {sessions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {sessions.map((s) => (
              <div
                key={s.id}
                className="rc-row"
                style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
                onClick={() => void selectSession(s.id)}
              >
                <span className="flag">📄</span>
                <span className="name">{s.label}</span>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  {new Date(s.startedAt).toLocaleString('zh-CN')}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          className="primary"
          style={{ width: '100%', padding: '9px 0' }}
          onClick={() => void startSession()}
        >
          开始第 {sessions.length + 1} 会期
        </button>

        {rosterOpen ? (
          <>
            <RosterEditor
              value={draft}
              onChange={setDraft}
              lockRemoval={locked}
            />
            <div className="row2" style={{ marginTop: 10 }}>
              <button
                className="ghost"
                onClick={() => {
                  setRosterOpen(false);
                  setDraft([]);
                }}
              >
                取消
              </button>
              <button
                className="primary"
                onClick={() => {
                  void updateRoster(draft);
                  setRosterOpen(false);
                  setDraft([]);
                }}
              >
                保存名册（{draft.length} 席）
              </button>
            </div>
          </>
        ) : (
          <button
            className="ghost"
            style={{ width: '100%', marginTop: 10, fontSize: 11 }}
            onClick={() => {
              setDraft(committee.delegations);
              setRosterOpen(true);
            }}
          >
            调整名册（{locked ? '已开场，仅可增补' : '可增可减'}）
          </button>
        )}

        <button
          className="ghost"
          style={{ width: '100%', marginTop: 10, fontSize: 11 }}
          onClick={() => {
            if (window.confirm('确定清空本机全部会议数据？此操作不可恢复。')) void resetAll();
          }}
        >
          清空全部数据
        </button>
      </div>
    </div>
  );
}
