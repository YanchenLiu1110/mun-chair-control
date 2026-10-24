/**
 * 提示音：用 WebAudio 现场合成，不依赖任何音频资源文件。
 * 浏览器要求首次交互后才能出声，所以 ensureAudio() 在"开始计时"里调用。
 */

let ctx: AudioContext | null = null;

export function ensureAudio(): void {
  if (typeof window === 'undefined') return;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, duration: number, delay = 0, gain = 0.16): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** 剩余 N 秒：两声短提示 */
export function chimeWarning(): void {
  tone(1046, 0.1);
  tone(1046, 0.1, 0.16);
}

/** 归零：三声下行 */
export function chimeExpire(): void {
  tone(784, 0.18);
  tone(622, 0.18, 0.2);
  tone(523, 0.42, 0.4, 0.2);
}

/** 投票结果 / 通过提示 */
export function chimePass(): void {
  tone(659, 0.12);
  tone(880, 0.18, 0.14);
}
