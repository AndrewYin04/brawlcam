// Synthesized sound effects (WebAudio). No third-party audio files, so no licensing concerns.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function audioInit() {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function audioResume() {
  audioInit();
  ctx?.resume().catch(() => {});
}

export function setSfxMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.6;
}
export const sfxMuted = () => muted;

function noise(dur: number) {
  const c = ctx!;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function env(g: GainNode, t: number, a: number, peak: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
}

export function sfxPunch(power = 0.5) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  // Low thump
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140 + power * 40, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  const g = ctx.createGain();
  env(g, t, 0.004, 0.9, 0.18);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.25);
  // Slap
  const n = noise(0.12);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800 + power * 1500;
  f.Q.value = 0.8;
  const g2 = ctx.createGain();
  env(g2, t, 0.002, 0.7 * (0.5 + power), 0.08);
  n.connect(f).connect(g2).connect(master);
  n.start(t);
}

export function sfxBlock() {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  for (const fr of [900, 1350]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = fr;
    const g = ctx.createGain();
    env(g, t, 0.002, 0.25, 0.12);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.2);
  }
}

export function sfxWhoosh() {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const n = noise(0.25);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.5;
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(2500, t + 0.2);
  const g = ctx.createGain();
  env(g, t, 0.03, 0.25, 0.2);
  n.connect(f).connect(g).connect(master);
  n.start(t);
}

export function sfxSuper() {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 0.35);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2400;
  const g = ctx.createGain();
  env(g, t, 0.02, 0.35, 0.5);
  o.connect(f).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.6);
  sfxPunch(1);
}

export function sfxKO() {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = [523, 659, 784][i];
    const g = ctx.createGain();
    env(g, t + i * 0.12, 0.01, 0.15, 0.3);
    o.connect(g).connect(master);
    o.start(t + i * 0.12);
    o.stop(t + i * 0.12 + 0.4);
  }
  sfxCrowd(1.5);
}

export function sfxCrowd(dur = 1) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const n = noise(dur);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(master);
  n.start(t);
}

export function sfxBeep(high = false) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = high ? 1046 : 523;
  const g = ctx.createGain();
  env(g, t, 0.005, 0.3, high ? 0.5 : 0.15);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.6);
}

/** Guard break: glass shattering (bright filtered noise burst plus a few high pings). */
export function sfxGlass() {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const n = noise(0.6);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const g = ctx.createGain();
  env(g, t, 0.003, 0.5, 0.45);
  n.connect(hp).connect(g).connect(master);
  n.start(t);
  for (let i = 0; i < 6; i++) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2800 + Math.random() * 3200;
    const og = ctx.createGain();
    const st = t + Math.random() * 0.25;
    env(og, st, 0.002, 0.12, 0.18);
    o.connect(og).connect(master);
    o.start(st);
    o.stop(st + 0.25);
  }
}
