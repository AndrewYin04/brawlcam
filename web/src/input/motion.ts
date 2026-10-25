// Opt-in motion data (no video, no player id), sent only with explicit consent:
// - labeled landmark sequences around each detected move, and
// - the continuous pose stream of the session: world landmarks at 15 fps as compact number arrays, batched every 2 s,
//   capped at 10 minutes per session.
import { motionConsent } from '../pages/consent';
import type { PoseInput } from './players';

export class MotionRecorder {
  private hist: { t: number; world: number[][] }[] = [];
  private pending: { t: number; label: string; landmarks: number[][][] }[] = [];
  private session = crypto.randomUUID();
  private lastFlush = performance.now();
  private wasBlocking = false;
  private wasDodging = false;
  sent = 0;
  private stream: number[][] = [];
  private streamT0 = 0;
  private lastStreamAt = 0;
  private streamFrames = 0;
  private lastStreamFlush = performance.now();
  streamSent = 0;
  label = 'practice';
  static readonly STREAM_FPS = 15;
  static readonly STREAM_MAX_FRAMES = 15 * 60 * 10; // 10 minutes per session

  newSession(label = 'practice') {
    this.flushStream();
    this.session = crypto.randomUUID();
    this.label = label;
    this.streamFrames = 0;
  }

  /** Call every frame with the latest pose for player 0. */
  observe(pose: PoseInput, labels: string[]) {
    if (!motionConsent()) return;
    const p = pose.lastPeople[0];
    const now = performance.now();
    if (p) {
      const last = this.hist[this.hist.length - 1];
      if (!last || last.world !== (p.world as unknown)) this.hist.push({ t: now, world: p.world.map((v) => v.slice(0, 4).map((x) => +x.toFixed(4))) });
      while (this.hist.length && now - this.hist[0].t > 700) this.hist.shift();
    }
    const g = pose.latest[0];
    if (g?.blocking && !this.wasBlocking) labels.push('block');
    this.wasBlocking = !!g?.blocking;
    const dodging = !!g && Math.abs(g.move[0]) > 0.85;
    if (dodging && !this.wasDodging) labels.push('dodge');
    this.wasDodging = dodging;
    for (const label of labels) {
      const frames = this.hist.filter((h) => now - h.t < 500).map((h) => h.world);
      if (frames.length >= 4) this.pending.push({ t: Date.now(), label: label === 'palm' ? 'palm' : label, landmarks: frames.slice(-15) });
    }
    if (this.pending.length && (now - this.lastFlush > 5000 || this.pending.length >= 20)) this.flush();
    // Continuous stream, downsampled to 15 fps: [ms since batch start, 33 x (x, y, z, visibility)] per frame.
    if (p && now - this.lastStreamAt >= 1000 / MotionRecorder.STREAM_FPS - 2 && this.streamFrames < MotionRecorder.STREAM_MAX_FRAMES) {
      this.lastStreamAt = now;
      if (!this.stream.length) this.streamT0 = Date.now();
      const row = [Date.now() - this.streamT0];
      for (const l of p.world) row.push(+l[0].toFixed(3), +l[1].toFixed(3), +l[2].toFixed(3), +(l[3] ?? 0).toFixed(2));
      this.stream.push(row);
      this.streamFrames++;
    }
    if (this.stream.length && now - this.lastStreamFlush > 2000) this.flushStream();
  }

  flushStream() {
    this.lastStreamFlush = performance.now();
    if (!this.stream.length || !motionConsent()) {
      this.stream = [];
      return;
    }
    const frames = this.stream.splice(0, this.stream.length);
    fetch('/api/pose-stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true, sessionId: this.session, label: this.label, t0: this.streamT0, frames }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (this.streamSent += j?.stored ?? 0))
      .catch(() => {});
  }

  flush() {
    if (!this.pending.length || !motionConsent()) {
      this.pending = [];
      return;
    }
    const samples = this.pending.splice(0, 40);
    this.lastFlush = performance.now();
    fetch('/api/pose-samples', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true, sessionId: this.session, samples }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (this.sent += j?.stored ?? 0))
      .catch(() => {});
  }
}
