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

// ---------- Commentary voice + crowd (separate volumes) ----------
let voiceBus: GainNode | null = null;
let crowdBus: GainNode | null = null;
function loadVol(k: string, d: number) {
  try {
    const v = Number(localStorage.getItem(k));
    return Number.isFinite(v) && localStorage.getItem(k) != null ? Math.max(0, Math.min(1, v)) : d;
  } catch {
    return d;
  }
}
export const volumes = { voice: loadVol('throwhands.vol.voice', 0.9), crowd: loadVol('throwhands.vol.crowd', 0.55) };
let voiceMuted = false;
function buses() {
  if (!ctx) return false;
  if (!voiceBus) {
    voiceBus = ctx.createGain();
    voiceBus.connect(ctx.destination);
    crowdBus = ctx.createGain();
    crowdBus.connect(ctx.destination);
    applyVolumes();
  }
  return true;
}
function applyVolumes() {
  if (voiceBus) voiceBus.gain.value = voiceMuted ? 0 : volumes.voice;
  if (crowdBus) crowdBus.gain.value = muted ? 0 : volumes.crowd * 0.8;
}
export function setVolume(kind: 'voice' | 'crowd', v: number) {
  volumes[kind] = Math.max(0, Math.min(1, v));
  try {
    localStorage.setItem('throwhands.vol.' + kind, String(volumes[kind]));
  } catch {}
  applyVolumes();
}
export function setVoiceMuted(m: boolean) {
  voiceMuted = m;
  applyVolumes();
}

const bufCache = new Map<string, Promise<AudioBuffer | null>>();
export function loadBuffer(url: string): Promise<AudioBuffer | null> {
  let p = bufCache.get(url);
  if (!p) {
    audioInit();
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((b) => ctx!.decodeAudioData(b))
      .catch(() => null);
    bufCache.set(url, p);
  }
  return p;
}
let currentVoice: AudioBufferSourceNode | null = null;
/** Diagnostics for tests: context state, voice bus gain, calls actually started. */
export const audioDiag = { played: 0, lastError: '' };
export function audioState() {
  return { state: ctx?.state ?? 'none', voiceGain: voiceBus?.gain.value ?? null, crowdGain: crowdBus?.gain.value ?? null, played: audioDiag.played, lastError: audioDiag.lastError };
}
/** Play a pre-rendered announcer call on the voice bus (cuts off the previous one). Returns its duration. */
export function playVoiceBuffer(buf: AudioBuffer): number {
  if (!ctx || !buses()) return 0;
  try {
    currentVoice?.stop();
  } catch {}
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(voiceBus!);
  src.start();
  currentVoice = src;
  audioDiag.played++;
  duckCrowd(buf.duration);
  if (ctx.state !== 'running') {
    audioDiag.lastError = 'context ' + ctx.state;
    void ctx.resume();
  }
  return buf.duration;
}

// Crowd: real crowd recordings (ElevenLabs sound effects, /crowd/): a looping arena bed, roars, "ooh"s, a gasp, a
// chant. The crowd ducks about 8 dB under each announcer call so it never covers it.
let crowdBed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let chantNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let duckGain: GainNode | null = null;
const CROWD = (id: string) => `/crowd/${id}.mp3`;
for (const id of ['bed', 'roar_0', 'roar_1', 'roar_2', 'ooh_0', 'ooh_1', 'gasp_0', 'chant_0']) void loadBuffer(CROWD(id));
function duckBus() {
  if (!ctx || !buses()) return null;
  if (!duckGain) {
    duckGain = ctx.createGain();
    duckGain.connect(crowdBus!);
  }
  return duckGain;
}
/** Duck the crowd under a voice line of `sec` seconds. */
export function duckCrowd(sec: number) {
  const d = duckBus();
  if (!d || !ctx) return;
  const t = ctx.currentTime;
  d.gain.cancelScheduledValues(t);
  d.gain.setValueAtTime(d.gain.value, t);
  d.gain.linearRampToValueAtTime(0.4, t + 0.08); // about -8 dB
  d.gain.setValueAtTime(0.4, t + sec);
  d.gain.linearRampToValueAtTime(1, t + sec + 0.4);
}
function playCrowd(id: string, gain = 1) {
  const d = duckBus();
  if (!d || !ctx) return;
  void loadBuffer(CROWD(id)).then((buf) => {
    if (!buf || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(d);
    src.start();
  });
}
export function crowdStart() {
  if (!ctx || crowdBed) return;
  const d = duckBus();
  if (!d) return;
  const gain = ctx.createGain();
  gain.gain.value = 0.55;
  const src = ctx.createBufferSource();
  src.loop = true;
  src.connect(gain).connect(d);
  crowdBed = { src, gain };
  void loadBuffer(CROWD('bed')).then((buf) => {
    if (!buf || !crowdBed || crowdBed.src !== src) return;
    src.buffer = buf;
    src.start();
  });
}
export function crowdStop() {
  try {
    crowdBed?.src.stop();
  } catch {}
  crowdBed = null;
  crowdChant(false);
}
/** A real crowd roar for a big moment (0..1 picks the size). */
export function crowdRoar(level = 1) {
  if (level < 0.55) return;
  playCrowd(`roar_${Math.floor(Math.random() * 3)}`, 0.5 + 0.5 * level);
}
/** Crowd "ooh" (blocked heavy hit, near miss). */
export function crowdOoh() {
  playCrowd(`ooh_${Math.floor(Math.random() * 2)}`, 0.9);
}
/** Crowd gasp (guard break). */
export function crowdGasp() {
  playCrowd('gasp_0', 1);
}
/** Rhythmic crowd chant while someone is on low HP (looped recording). */
export function crowdChant(on: boolean) {
  if (!on) {
    try {
      chantNode?.src.stop();
    } catch {}
    chantNode = null;
    return;
  }
  if (chantNode || !ctx) return;
  const d = duckBus();
  if (!d) return;
  const src = ctx.createBufferSource();
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = 0.6;
  src.connect(gain).connect(d);
  chantNode = { src, gain };
  void loadBuffer(CROWD('chant_0')).then((buf) => {
    if (!buf || !chantNode || chantNode.src !== src) return;
    src.buffer = buf;
    src.start();
  });
}
/** Short arena music sting between rounds (synthesized). */
export function roundSting() {
  if (!ctx || !buses()) return;
  const t = ctx.currentTime;
  [261.6, 329.6, 392, 523.3].forEach((f, i) => {
    const o = ctx!.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = ctx!.createGain();
    env(g, t + i * 0.11, 0.01, 0.12, 0.5);
    o.connect(lp).connect(g).connect(crowdBus!);
    o.start(t + i * 0.11);
    o.stop(t + i * 0.11 + 0.7);
  });
}
