/** 用 WebAudio 合成音效，不需要音频文件 */
let ctx: AudioContext | null = null;
export let soundOn = true;
export const setSound = (v: boolean) => (soundOn = v);

function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 在用户第一次触摸时调用，解锁 iOS 的音频 */
export const unlockAudio = () => { if (soundOn) ac(); };

function noise(a: AudioContext, dur: number) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource();
  s.buffer = buf;
  return s;
}

/** 「咚」：低频下滑正弦 + 一点点木头的噪声 */
export function playThud(soft = false) {
  if (!soundOn) return;
  const a = ac(), t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(soft ? 120 : 190, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.16);
  g.gain.setValueAtTime(soft ? 0.35 : 0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + 0.25);

  const n = noise(a, 0.06), f = a.createBiquadFilter(), ng = a.createGain();
  f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
  ng.gain.value = soft ? 0.15 : 0.4;
  n.connect(f).connect(ng).connect(a.destination);
  n.start(t);
}

/** 出手的「嗖」 */
export function playWhoosh() {
  if (!soundOn) return;
  const a = ac(), t = a.currentTime;
  const n = noise(a, 0.35), f = a.createBiquadFilter(), g = a.createGain();
  f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(600, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  n.connect(f).connect(g).connect(a.destination);
  n.start(t);
}
