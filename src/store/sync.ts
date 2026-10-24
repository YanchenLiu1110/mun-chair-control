import type { Committee, SessionState } from '../domain/types';

/**
 * 主窗口 ↔ 投影窗口 同步总线。
 *
 * 关键决策：主窗口是唯一时钟权威。
 * 广播的是完整 SessionState（含 timer.startedAt），投影窗口自己用本地 Date.now()
 * 推算剩余 —— 所以不需要每秒发消息，关掉主窗口的瞬间投影也不会停摆或漂移。
 */

const CHANNEL_NAME = 'mun-chair-sync-v1';

export interface SyncPayload {
  committee: Committee;
  state: SessionState;
}

type Msg =
  | { type: 'state'; payload: SyncPayload }
  | { type: 'hello' };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function publish(payload: SyncPayload): void {
  getChannel()?.postMessage({ type: 'state', payload } satisfies Msg);
}

export function subscribe(cb: (p: SyncPayload) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (e: MessageEvent<Msg>) => {
    if (e.data?.type === 'state') cb(e.data.payload);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

/** 投影窗口刚打开时，主动要一次当前状态 */
export function requestSync(): void {
  getChannel()?.postMessage({ type: 'hello' } satisfies Msg);
}

/** 主窗口监听投影窗口的 hello，收到就补发一次 */
export function onPeerHello(cb: () => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (e: MessageEvent<Msg>) => {
    if (e.data?.type === 'hello') cb();
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
