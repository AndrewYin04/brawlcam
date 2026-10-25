// Research recording mode (?research=1, REVIEW.md 2:16 AM). After an explicit consent step every session it:
// - records the camera video with MediaRecorder, saved ONLY as a local download (never uploaded),
// - writes a JSONL log, one line per pose frame: time, 33 world + 33 image landmarks with visibility, detected
//   actions with their scores, movement input, game events, and the player's marker keys,
// - sends the landmark/action/marker stream (no video) to the server, tagged research, under a random session id.
// Markers: Space = "I did a move and it did not register", F = "it fired a move I did not do",
// 1..9 = "I just did move N" (see MOVES).
import type { PoseInput } from './input/players';

export const MOVES = ['jab', 'hook', 'uppercut', 'block', 'xshield', 'palm', 'kick', 'step_side', 'step_fwd_back'];
type Line = { t: number; at: number; world?: number[][]; image?: number[][]; actions?: { kind: string; hand: string; speed: number }[]; move?: [number, number]; blocking?: boolean; xshield?: boolean; marker?: string; event?: unknown };

const round = (v: number) => Math.round(v * 10000) / 10000;

class Research {
  enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('research');
  active = false;
  sessionId = '';
  private lines: string[] = [];
  private batch: { t: number; ft?: number; lm: number[]; acts: string[]; mv: number[]; mk: string | null; lb?: string | null; rp?: number }[] = [];
  /** Current drill prompt label and rep number (labels come from the drill script, not keys). */
  private label: string | null = null;
  private rep = 0;
  /** Drills subscribe to every pose frame. */
  frameListener: ((t: number, people: any[], outs: any[]) => void) | null = null;
  /** Guided drills requested on the consent screen (or ?drills=1). */
  drills = typeof location !== 'undefined' && new URLSearchParams(location.search).has('drills');
  setLabel(label: string | null, rep: number) {
    this.label = label;
    this.rep = rep;
  }
  markRep(label: string, rep: number, detected: boolean) {
    if (this.active) this.lines.push(JSON.stringify({ at: Date.now() - this.startedAt, rep_end: { label, rep, detected } }));
  }
  private pendingMarker: string | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private sendTimer = 0;
  stats = { frames: 0, sent: 0, markers: 0, sendErrors: 0 };
  saveVideo = true;
  private checkpointTimer = 0;
  private part = 0;

  /** Full-screen consent, every session. Resolves true only after the box is ticked and Start is pressed. */
  consent(): Promise<boolean> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'overlay research-consent';
      el.innerHTML = `<div class="center-card" style="max-width:560px;text-align:left">
        <h2>Research recording</h2>
        <p><b>This session records your camera video to a file on this device, and sends your body-point coordinates, labeled research, to our server. Video is never uploaded.</b></p>
        <ul class="muted" style="line-height:1.5">
          <li>Saved on this device when you stop: <code>throwhands-research-&lt;time&gt;.webm</code> (video) and <code>.jsonl</code> (body points, detected moves, your markers).</li>
          <li>Sent to the server: the 33 body points per frame, detected moves, movement input and your markers, under a random session id. No name, no player id, no video.</li>
          <li>Keys while playing: <b>Space</b> = I did a move and it did not register · <b>F</b> = it fired a move I did not do · <b>1–9</b> = I just did ${MOVES.map((m, i) => `${i + 1} ${m.replace('_', ' ')}`).join(', ')}.</li>
        </ul>
        <label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input type="checkbox" id="rc-ok" /> I agree to record this session as described.</label>
        <label style="display:flex;gap:8px;align-items:center;margin:4px 0 12px"><input type="checkbox" id="rc-video" checked /> Also save the camera video on this device</label>
        <div class="row"><button class="btn primary" id="rc-start" disabled>Start recording</button><button class="btn" id="rc-drills" disabled>Guided drills (about 3 minutes)</button><button class="btn ghost" id="rc-no">No thanks (play normally)</button></div>
      </div>`;
      document.body.appendChild(el);
      const ok = el.querySelector<HTMLInputElement>('#rc-ok')!;
      const start = el.querySelector<HTMLButtonElement>('#rc-start')!;
      const drillsBtn = el.querySelector<HTMLButtonElement>('#rc-drills')!;
      ok.onchange = () => (start.disabled = drillsBtn.disabled = !ok.checked);
      const go = (drills: boolean) => {
        if (!ok.checked) return;
        this.saveVideo = el.querySelector<HTMLInputElement>('#rc-video')!.checked;
        el.remove();
        this.active = true;
        this.drills = this.drills || drills;
        this.sessionId = crypto.randomUUID();
        resolve(true);
      };
      start.onclick = () => go(false);
      drillsBtn.onclick = () => go(true);
      el.querySelector<HTMLButtonElement>('#rc-no')!.onclick = () => {
        el.remove();
        this.enabled = false;
        resolve(false);
      };
    });
  }

  /** Begin recording once the camera and pose tracker are running. */
  start(video: HTMLVideoElement, pose: PoseInput) {
    if (!this.active || this.recorder || this.startedAt) return;
    this.startedAt = Date.now();
    const stream = video.srcObject as MediaStream | null;
    if (stream && typeof MediaRecorder !== 'undefined' && this.saveVideo) {
      // H.264 first: it is usually hardware-encoded (measured: pose 14.4 fps with H.264 vs 12.4 with VP9 while recording).
      const type = ['video/webm;codecs=h264', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      try {
        this.recorder = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 1_000_000 } : undefined);
        this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
        this.recorder.start(1000);
      } catch (e) {
        console.warn('[research] MediaRecorder failed', e);
      }
    }
    const prevRaw = pose.onRaw;
    pose.onRaw = (t, people, outs) => {
      prevRaw?.(t, people, outs);
      const p = people[0];
      const o = outs[0];
      const mk = this.pendingMarker;
      this.pendingMarker = null;
      const line: Line = { t: +t.toFixed(3), at: Date.now() - this.startedAt };
      if (p) {
        line.world = p.world.map((l) => l.slice(0, 4).map(round));
        line.image = p.image.map((l) => l.slice(0, 4).map(round));
      }
      if (o) {
        if (o.actions.length) line.actions = o.actions.map((a) => ({ kind: a.kind, hand: a.hand, speed: +a.speed.toFixed(2) }));
        line.move = [+o.move[0].toFixed(2), +o.move[1].toFixed(2)];
        line.blocking = o.blocking;
        line.xshield = o.xshield;
      }
      if (mk) line.marker = mk;
      if (this.label) Object.assign(line, { label: this.label, rep: this.rep });
      this.lines.push(JSON.stringify(line));
      this.frameListener?.(t, people, outs);
      this.stats.frames++;
      if (p)
        this.batch.push({
          t: Date.now(),
          ft: +t.toFixed(3),
          lm: [...p.world.flatMap((l) => l.slice(0, 4).map(round)), ...p.image.flatMap((l) => l.slice(0, 4).map(round))],
          acts: (o?.actions ?? []).map((a) => `${a.kind}:${a.hand}:${a.speed.toFixed(2)}`),
          mv: o ? [+o.move[0].toFixed(2), +o.move[1].toFixed(2)] : [0, 0],
          mk,
          lb: this.label,
          rp: this.rep,
        });
    };
    addEventListener('keydown', this.onKey);
    this.sendTimer = window.setInterval(() => void this.flush(), 2000);
    // Never lose a session: save when the page is closed, and checkpoint the files every 2 minutes.
    addEventListener('pagehide', () => void this.finish());
    this.checkpointTimer = window.setInterval(() => void this.checkpoint(), 120_000);
    this.showBar();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.active || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    let mk: string | null = null;
    if (e.code === 'Space') mk = 'missed';
    else if (e.key === 'f' || e.key === 'F') mk = 'false_fire';
    else if (/^[1-9]$/.test(e.key)) mk = 'did:' + MOVES[Number(e.key) - 1];
    if (!mk) return;
    e.preventDefault();
    this.pendingMarker = mk;
    this.lines.push(JSON.stringify({ at: Date.now() - this.startedAt, marker: mk }));
    this.stats.markers++;
    const b = document.getElementById('research-last');
    if (b) b.textContent = `marked: ${mk.replace('did:', 'did ')}`;
  };

  /** Game events (hits, blocks, guard breaks...) into the JSONL log. */
  event(e: unknown) {
    if (!this.active || !this.startedAt) return;
    this.lines.push(JSON.stringify({ at: Date.now() - this.startedAt, event: e }));
  }

  private async flush() {
    if (!this.batch.length) return;
    const frames = this.batch.splice(0, this.batch.length);
    try {
      const r = await fetch('/api/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true, sessionId: this.sessionId, frames }) });
      if (r.ok) this.stats.sent += frames.length;
      else this.stats.sendErrors++;
    } catch {
      this.stats.sendErrors++;
    }
  }

  private showBar() {
    const bar = document.createElement('div');
    bar.id = 'research-bar';
    bar.innerHTML = `<span class="rec-dot"></span> REC research · Space = missed move · F = false move · 1–9 = I did move N · <span id="research-last"></span> <button class="btn primary" id="research-stop">Stop &amp; save files</button>`;
    document.body.appendChild(bar);
    bar.querySelector<HTMLButtonElement>('#research-stop')!.onclick = () => void this.finish();
  }

  /** Save what we have so far (video so far + log so far) without stopping: a crash loses at most 2 minutes. */
  private async checkpoint() {
    if (!this.active) return;
    this.part++;
    this.recorder?.requestData();
    await new Promise((r) => setTimeout(r, 300));
    this.save(`-part${this.part}`);
  }

  private save(suffix = '') {
    const stamp = new Date(this.startedAt || Date.now()).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dl = (blob: Blob, name: string) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 5000);
    };
    const header = JSON.stringify({ throwhands_research: 1, sessionId: this.sessionId, startedAt: new Date(this.startedAt).toISOString(), moves: MOVES, landmarks: 'MediaPipe Pose 33: world [x,y,z,visibility] metres hip-centred; image [x,y,z,visibility] normalised' });
    const base = `throwhands-research-${stamp}${suffix}`;
    dl(new Blob([header + '\n' + this.lines.join('\n') + '\n'], { type: 'application/x-ndjson' }), `${base}.jsonl`);
    const ext = (this.chunks[0]?.type ?? '').includes('mp4') ? 'mp4' : 'webm';
    if (this.chunks.length) dl(new Blob(this.chunks, { type: this.chunks[0].type || 'video/webm' }), `${base}.${ext}`);
    toastSaved(`${base}.${ext} and .jsonl`);
  }

  /** Stop recording and download the video and the JSONL log (also called on Quit, leaving the match, page close). */
  async finish() {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.sendTimer);
    clearInterval(this.checkpointTimer);
    removeEventListener('keydown', this.onKey);
    await this.flush();
    if (this.recorder && this.recorder.state !== 'inactive') {
      await new Promise<void>((res) => {
        this.recorder!.onstop = () => res();
        this.recorder!.stop();
      });
    }
    this.save();
    document.getElementById('research-bar')?.remove();
    (window as any).__brawl && ((window as any).__brawl.research = { ...this.stats, saved: true });
  }
}

function toastSaved(names: string) {
  const t = document.createElement('div');
  t.className = 'research-toast';
  t.textContent = `Saved to your Downloads folder: ${names}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

export const research = new Research();
