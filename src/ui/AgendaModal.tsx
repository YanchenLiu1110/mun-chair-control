import { useEffect, useState } from 'react';
import type { AgendaItem } from '../domain/types';

interface Props {
  open: boolean;
  initial: AgendaItem | null;
  onClose: () => void;
  onSave: (topicZh: string, topicEn: string) => void;
}

export function AgendaModal({ open, initial, onClose, onSave }: Props) {
  const [zh, setZh] = useState('');
  const [en, setEn] = useState('');

  useEffect(() => {
    if (open) {
      setZh(initial?.topicZh ?? '');
      setEn(initial?.topicEn ?? '');
    }
  }, [open, initial]);

  if (!open) return null;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ width: 'min(520px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>设定议题</h2>
          <span className="en">Agenda</span>
        </div>
        <div className="modal-body" style={{ background: 'var(--panel)' }}>
          <div className="field">
            <label>议题（中文）</label>
            <input
              autoFocus
              value={zh}
              onChange={(e) => setZh(e.target.value)}
              placeholder="如：全球能源转型与公正过渡"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>议题（英文）</label>
            <input
              value={en}
              onChange={(e) => setEn(e.target.value)}
              placeholder="e.g. Global Energy Transition and Just Transition"
            />
          </div>
        </div>
        <div className="modal-foot">
          <span style={{ flex: 1 }} />
          <button onClick={onClose}>取消</button>
          <button
            className="primary"
            disabled={!zh.trim()}
            onClick={() => {
              onSave(zh.trim(), en.trim());
              onClose();
            }}
          >
            保存议题
          </button>
        </div>
      </div>
    </div>
  );
}
