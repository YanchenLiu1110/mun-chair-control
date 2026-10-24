import { useEffect, useState } from 'react';

/** 每 intervalMs 触发一次重渲染，用于倒计时显示。不写事件、不落库。 */
export function useNow(intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
