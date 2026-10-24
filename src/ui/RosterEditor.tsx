import { useMemo, useState } from 'react';
import {
  availableFromPool,
  extendRoster,
  makeDelegation,
  POOL_SIZE,
  poolDelegations,
  ROSTER_PRESETS,
} from '../domain/delegations';
import type { Delegation } from '../domain/types';

interface Props {
  value: Delegation[];
  onChange: (next: Delegation[]) => void;
  /** 已有会期时禁止删人：历史事件按 delegationId 关联，删了会留下悬空引用 */
  lockRemoval?: boolean;
}

/**
 * 名册编辑器。
 * 委员会规模不写死：可以从 3 席到全池任意取值，也可以完全自定义代表。
 */
export function RosterEditor({ value, onChange, lockRemoval = false }: Props) {
  const [countText, setCountText] = useState(String(value.length));
  const [customOpen, setCustomOpen] = useState(false);
  const [zh, setZh] = useState('');
  const [en, setEn] = useState('');
  const [shortZh, setShortZh] = useState('');
  const [flag, setFlag] = useState('');
  const [isP5, setIsP5] = useState(false);
  const [err, setErr] = useState('');

  const available = useMemo(() => availableFromPool(value), [value]);

  const applyCount = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) {
      setCountText(String(value.length));
      return;
    }
    const target = Math.max(1, Math.min(POOL_SIZE, Math.round(n)));
    if (target === value.length) {
      setCountText(String(target));
      return;
    }
    if (target < value.length) {
      if (lockRemoval) {
        setErr('已开始会期，不能减少席位');
        setCountText(String(value.length));
        return;
      }
      onChange(value.slice(0, target));
    } else {
      onChange(extendRoster(value, target));
    }
    setErr('');
    setCountText(String(target));
  };

  const remove = (id: string) => {
    if (lockRemoval) return;
    onChange(value.filter((d) => d.id !== id));
    setCountText(String(value.length - 1));
  };

  const addCustom = () => {
    if (!zh.trim() && !en.trim()) {
      setErr('中文名或英文名至少填一个');
      return;
    }
    const d = makeDelegation({ nameZh: zh, nameEn: en, shortZh, flag, isP5 }, value);
    onChange([...value, d]);
    setZh('');
    setEn('');
    setShortZh('');
    setFlag('');
    setIsP5(false);
    setErr('');
    setCountText(String(value.length + 1));
  };

  return (
    <div className="roster-editor">
      <div className="re-head">
        <span className="re-title">代表名册</span>
        <span className="re-count num">{value.length} 席</span>
      </div>

      <div className="re-presets">
        {ROSTER_PRESETS.map((p) => {
          const n = p.build().length;
          const on = value.length === n;
          return (
            <button
              key={p.id}
              type="button"
              className={`chip ${on ? 'on' : ''}`}
              onClick={() => {
                if (lockRemoval && n < value.length) {
                  setErr('已开始会期，不能减少席位');
                  return;
                }
                onChange(p.build());
                setCountText(String(n));
                setErr('');
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="re-countrow">
        <label>席位数</label>
        <input
          type="number"
          min={1}
          max={POOL_SIZE}
          value={countText}
          onChange={(e) => setCountText(e.target.value)}
          onBlur={(e) => applyCount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyCount((e.target as HTMLInputElement).value);
          }}
        />
        <span className="re-hint">回车生效 · 上限 {POOL_SIZE}</span>
      </div>

      {err && <div className="re-err">{err}</div>}

      <div className="re-list">
        {value.map((d, i) => (
          <div className="re-row" key={d.id}>
            <span className="num re-idx">{i + 1}</span>
            <span className="flag">{d.flag}</span>
            <span className="nm">{d.shortZh}</span>
            <span className="en">{d.nameEn}</span>
            {d.isP5 && <span className="re-tag">否决</span>}
            <button
              type="button"
              className="re-x"
              disabled={lockRemoval}
              title={lockRemoval ? '已开始会期，不能移除代表' : '移出名单'}
              onClick={() => remove(d.id)}
            >
              ✕
            </button>
          </div>
        ))}
        {value.length === 0 && <div className="re-empty">名册为空，请从下方添加</div>}
      </div>

      <div className="re-add">
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const d = poolDelegations().find((x) => x.id === id);
            if (d) {
              onChange([...value, d]);
              setCountText(String(value.length + 1));
            }
          }}
        >
          <option value="">从内置名单添加…</option>
          {available.map((d) => (
            <option key={d.id} value={d.id}>
              {d.flag} {d.shortZh} · {d.nameEn}
            </option>
          ))}
        </select>
        <button type="button" className="ghost sm" onClick={() => setCustomOpen((v) => !v)}>
          {customOpen ? '收起自定义' : '＋ 自定义代表'}
        </button>
      </div>

      {customOpen && (
        <div className="re-custom">
          <input placeholder="中文全称" value={zh} onChange={(e) => setZh(e.target.value)} />
          <input placeholder="英文名（决定 ID）" value={en} onChange={(e) => setEn(e.target.value)} />
          <input
            placeholder="短名（表格显示）"
            value={shortZh}
            onChange={(e) => setShortZh(e.target.value)}
          />
          <input
            className="re-flag"
            placeholder="🏳️"
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
          />
          <label className="re-p5">
            <input type="checkbox" checked={isP5} onChange={(e) => setIsP5(e.target.checked)} />
            否决权
          </label>
          <button type="button" className="primary sm" onClick={addCustom}>
            添加
          </button>
        </div>
      )}
    </div>
  );
}
