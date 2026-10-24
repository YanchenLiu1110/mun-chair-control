import { useState } from 'react';
import type { QuorumInfo } from '../domain/derive';
import type { ScriptKey, ScriptLibrary } from '../domain/script';
import {
  deriveScriptKey,
  loadScripts,
  resetScripts,
  saveScripts,
  SCRIPT_KEY_LABEL,
  SCRIPT_KEY_ORDER,
} from '../domain/script';
import type { SessionState } from '../domain/types';
import { useNow } from './useNow';

interface Props {
  state: SessionState;
  quorum: QuorumInfo | null;
  warningSec: number;
}

export function ChairScript({ state, quorum, warningSec }: Props) {
  const now = useNow(500);
  const [lib, setLib] = useState<ScriptLibrary>(loadScripts);
  const [editing, setEditing] = useState(false);

  const key = deriveScriptKey(state, quorum, warningSec, now);
  const entries = lib[key] ?? [];

  const update = (next: ScriptLibrary) => {
    setLib(next);
    saveScripts(next);
  };

  return (
    <>
      <div className="script-strip">
        <div className="ss-head">
          <span className="ss-key">{SCRIPT_KEY_LABEL[key]}</span>
          <span className="ss-en">Chair Script</span>
          <span style={{ flex: 1 }} />
          <button className="sm ghost" onClick={() => setEditing(true)}>
            编辑话术
          </button>
        </div>
        <div className="ss-lines">
          {entries.slice(0, 2).map((e) => (
            <div className="ss-line" key={e.id}>
              <div className="zh">{e.zh}</div>
              <div className="en">{e.en}</div>
            </div>
          ))}
          {entries.length === 0 && <div className="ss-line"><div className="zh">（此状态暂无台词）</div></div>}
        </div>
      </div>

      {editing && (
        <ScriptEditor
          lib={lib}
          onChange={update}
          onClose={() => setEditing(false)}
          onReset={() => {
            const d = resetScripts();
            setLib(d);
            return d;
          }}
        />
      )}
    </>
  );
}

function ScriptEditor({
  lib,
  onChange,
  onClose,
  onReset,
}: {
  lib: ScriptLibrary;
  onChange: (l: ScriptLibrary) => void;
  onClose: () => void;
  onReset: () => ScriptLibrary;
}) {
  const [key, setKey] = useState<ScriptKey>('voting_open');
  const entries = lib[key] ?? [];

  const setEntries = (next: ScriptLibrary[ScriptKey]) =>
    onChange({ ...lib, [key]: next });

  const patch = (id: string, field: 'zh' | 'en', value: string) =>
    setEntries(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ width: 'min(920px,100%)', height: 'min(680px,88vh)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>话术库</h2>
          <span className="en">Script Library</span>
          <span style={{ flex: 1 }} />
          <button
            className="sm ghost"
            onClick={() => {
              if (window.confirm('恢复默认话术？你自定义的内容会丢失。')) onReset();
            }}
          >
            恢复默认
          </button>
          <button className="sm" onClick={onClose}>
            完成
          </button>
        </div>

        <div className="script-editor">
          <div className="se-keys">
            {SCRIPT_KEY_ORDER.map((k) => (
              <button
                key={k}
                className={k === key ? 'on' : ''}
                onClick={() => setKey(k)}
              >
                {SCRIPT_KEY_LABEL[k]}
                <span className="tab-num">{(lib[k] ?? []).length}</span>
              </button>
            ))}
          </div>

          <div className="se-body">
            <div className="se-tip">
              这些台词会在对应会议状态下自动推送到提词器。中英文分栏编辑，可增删多条。
            </div>
            {entries.map((e, i) => (
              <div className="se-entry" key={e.id}>
                <div className="se-entry-head">
                  <span>第 {i + 1} 条</span>
                  <span style={{ flex: 1 }} />
                  <button
                    className="sm ghost"
                    onClick={() => setEntries(entries.filter((x) => x.id !== e.id))}
                  >
                    删除
                  </button>
                </div>
                <textarea
                  className="se-zh"
                  value={e.zh}
                  rows={2}
                  onChange={(ev) => patch(e.id, 'zh', ev.target.value)}
                  placeholder="中文台词"
                />
                <textarea
                  className="se-en"
                  value={e.en}
                  rows={2}
                  onChange={(ev) => patch(e.id, 'en', ev.target.value)}
                  placeholder="English script"
                />
              </div>
            ))}
            <button
              className="sm"
              onClick={() =>
                setEntries([
                  ...entries,
                  { id: `custom-${Date.now()}`, zh: '', en: '' },
                ])
              }
            >
              ＋ 新增一条
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
