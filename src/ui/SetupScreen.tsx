import { useState } from 'react';
import { seedDelegations } from '../domain/delegations';
import { RULESETS } from '../domain/rulesets';
import type { Delegation, Session } from '../domain/types';
import { countSessionEvents } from '../store/db';
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
  const { committee, sessions, startSession, selectSession, deleteSession, updateRoster, resetAll } =
    useSession();
  const [rosterOpen, setRosterOpen] = useState(false);
  const [draft, setDraft] = useState<Delegation[]>([]);
  if (!committee) return null;

  const locked = sessions.length > 0;
  // 和 store 里 startSession 用同一套算法，否则删过会期之后按钮上的序号会对不上
  const nextOrdinal = sessions.reduce((max, s) => Math.max(max, s.ordinal), 0) + 1;

  /** 永久删除：先数一下要扔掉多少条记录，再让主席确认 */
  const handleDelete = async (s: Session) => {
    const n = await countSessionEvents(s.id);
    const ok = window.confirm(
      `永久删除「${s.label}」？\n\n` +
        `这场会议的 ${n} 条操作记录会从本机彻底抹掉，撤销也回不来。\n\n` +
        `只是想结束这场会、以后还要翻记录的话，请在主席台点「休会」，不要删。`,
    );
    if (ok) await deleteSession(s.id);
  };

  /** 重置系统：不可逆，所以问两遍 */
  const handleReset = () => {
    if (
      !window.confirm(
        '重置系统？\n\n' +
          '委员会、名册、所有会期与全部操作记录都会从这台电脑上清空，' +
          '话术库和阵营权重也会恢复默认。',
      )
    )
      return;
    if (!window.confirm('再确认一次：重置之后无法恢复，也没有备份。确定吗？')) return;
    void resetAll();
  };

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
                className="rc-row sess-row"
                onClick={() => void selectSession(s.id)}
              >
                <span className="flag">📄</span>
                <span className="name">{s.label}</span>
                <span className={`pill ${s.endedAt ? '' : 'ok'}`}>
                  {s.endedAt ? '已结束' : '进行中'}
                </span>
                <span className="sess-time">{new Date(s.startedAt).toLocaleString('zh-CN')}</span>
                <button
                  className="sm ghost sess-del"
                  title="永久删除这个会期及其全部记录"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(s);
                  }}
                >
                  删除
                </button>
              </div>
            ))}
            <div className="hint" style={{ marginTop: 8 }}>
              点任一会期可以重新打开继续操作；已休会的场次也能打开查看或补记录。
            </div>
          </div>
        )}

        <button
          className="primary"
          style={{ width: '100%', padding: '9px 0' }}
          onClick={() => void startSession()}
        >
          开始第 {nextOrdinal} 会期
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

        <div className="reset-zone">
          <button className="ghost danger" onClick={handleReset}>
            重置系统（清空全部数据）
          </button>
          <div className="hint" style={{ marginTop: 6 }}>
            只清本机浏览器里的数据，不会影响别处；重置后回到初始设置页。
          </div>
        </div>
      </div>
    </div>
  );
}
