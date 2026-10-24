import { useMemo } from 'react';
import { buildMinutes, toMarkdown, toWordHtml } from '../domain/minutes';
import type { SessionEvent } from '../domain/events';
import type { Committee, Ruleset, Session, SessionState } from '../domain/types';

interface Props {
  open: boolean;
  onClose: () => void;
  committee: Committee;
  session: Session | null;
  ruleset: Ruleset;
  state: SessionState;
  events: SessionEvent[];
}

function download(filename: string, content: string, mime: string, bom = false): void {
  // Word 需要 BOM 才认 UTF-8 中文；Markdown 加 BOM 反而会在某些编辑器里显示成乱码字符
  const blob = new Blob([bom ? `\ufeff${content}` : content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function MinutesModal({ open, onClose, committee, session, ruleset, state, events }: Props) {
  const lines = useMemo(() => {
    if (!open || !session) return [];
    return buildMinutes({ committee, session, ruleset, state, events });
  }, [open, committee, session, ruleset, state, events]);

  const markdown = useMemo(() => toMarkdown(lines), [lines]);

  if (!open) return null;

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${committee.nameZh}-${session?.label ?? ''}-纪要-${stamp}`;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>会议纪要</h2>
          <span className="en">Minutes</span>
          <span className="spacer" />
          <span className="pill">{events.length} 条事件</span>
          <button className="ghost sm" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="modal-body">
          <pre className="minutes-pre">{markdown}</pre>
        </div>

        <div className="modal-foot">
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            纪要从事件流实时生成，不做二次存储；改规则集不会改变历史结论。
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => download(`${base}.md`, markdown, 'text/markdown;charset=utf-8')}
          >
            下载 Markdown
          </button>
          <button
            className="primary"
            onClick={() =>
              download(
                `${base}.doc`,
                toWordHtml(lines, `${committee.nameZh} ${session?.label ?? ''} 会议纪要`),
                'application/msword;charset=utf-8',
                true,
              )
            }
          >
            下载 Word
          </button>
        </div>
      </div>
    </div>
  );
}
