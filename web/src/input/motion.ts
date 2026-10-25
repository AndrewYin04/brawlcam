// Opt-in motion data: labeled landmark sequences (no video, no player id), sent only with explicit consent.
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

  newSession() {
    this.session = crypto.randomUUID();
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
