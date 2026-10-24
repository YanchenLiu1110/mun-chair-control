import type { TimerState } from './types';

/** 计时器纯函数集合。全部无副作用，输入 (状态, 当前时刻) 输出新状态。 */

export function makeTimer(durationMs: number): TimerState {
  return {
    durationMs,
    remainingMs: durationMs,
    status: 'idle',
    startedAt: null,
    extendedMs: 0,
  };
}

/** 任意时刻的真实剩余毫秒 —— 全场唯一的"时钟换算"入口 */
export function remainingNow(t: TimerState, now: number): number {
  if (t.status === 'running' && t.startedAt != null) {
    return Math.max(0, t.remainingMs - (now - t.startedAt));
  }
  return t.remainingMs;
}

export function startTimer(t: TimerState, now: number, durationMs?: number): TimerState {
  const d = durationMs ?? t.durationMs;
  return {
    durationMs: d,
    remainingMs: d,
    status: 'running',
    startedAt: now,
    extendedMs: 0,
  };
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.status !== 'running') return t;
  return { ...t, status: 'paused', remainingMs: remainingNow(t, now), startedAt: null };
}

export function resumeTimer(t: TimerState, now: number): TimerState {
  if (t.status !== 'paused' && t.status !== 'expired') return t;
  if (t.remainingMs <= 0) return t;
  return { ...t, status: 'running', startedAt: now };
}

/** 加时：running 时需要重设基准点，否则剩余会瞬间跳变 */
export function extendTimer(t: TimerState, now: number, addMs: number): TimerState {
  if (t.status === 'running') {
    return {
      ...t,
      remainingMs: remainingNow(t, now) + addMs,
      startedAt: now,
      extendedMs: t.extendedMs + addMs,
      status: 'running',
    };
  }
  return { ...t, remainingMs: t.remainingMs + addMs, extendedMs: t.extendedMs + addMs };
}

export function resetTimer(t: TimerState): TimerState {
  return { ...t, remainingMs: t.durationMs, status: 'idle', startedAt: null, extendedMs: 0 };
}

export function expireTimer(t: TimerState): TimerState {
  return { ...t, remainingMs: 0, status: 'expired', startedAt: null };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
