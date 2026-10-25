// Live fight commentator: batches game events every few seconds into one hype line (Gemini), spoken aloud.
import type { SimEvent, Snapshot } from '../../../shared/sim';
import { summarize } from '../../../shared/commentary';

const $ = (id: string) => document.getElementById(id)!;
let muted = false;
try {
  muted = localStorage.getItem('throwhands.mute') === '1';
} catch {}

export function isMuted() {
  return muted;
}
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('throwhands.mute', m ? '1' : '0');
  } catch {}
  if (m) {
    window.speechSynthesis?.cancel();
    currentAudio?.pause();
  }
  $('btn-mute').textContent = m ? '🔇' : '🔊';
}

let currentAudio: HTMLAudioElement | null = null;
let hideTimer: number | undefined;
export const commentaryLog: { at: number; text: string; source: string; spoken: 'tts' | 'browser' | 'muted' | 'none' }[] = [];

/** Show and speak one line. audio is a data URL from Gemini TTS, or null to use the browser voice. */
export function playLine(text: string, audio: string | null, source = '') {
  const el = $('commentary');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
  let spoken: 'tts' | 'browser' | 'muted' | 'none' = 'none';
  if (muted) spoken = 'muted';
  else if (audio) {
    try {
      currentAudio?.pause();
      currentAudio = new Audio(audio);
      currentAudio.volume = 0.9;
      void currentAudio.play().catch(() => speakBrowser(text));
      spoken = 'tts';
    } catch {
      speakBrowser(text);
      spoken = 'browser';
    }
  } else if (speakBrowser(text)) spoken = 'browser';
  commentaryLog.push({ at: Date.now(), text, source, spoken });
  if (commentaryLog.length > 200) commentaryLog.shift();
}

function speakBrowser(text: string): boolean {
  const ss = window.speechSynthesis;
  if (!ss || muted) return false;
  try {
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.15;
    u.pitch = 1.05;
    ss.speak(u);
    return true;
  } catch {
    return false;
  }
}

/** Local-mode commentator: asks the API server every ~3.5 s when something happened. */
export class Commentator {
  private buf: SimEvent[] = [];
  private last = 0;
  private inflight = false;
  enabled = true;

  push(events: SimEvent[]) {
    for (const e of events) if (e.type !== 'whiff' && e.type !== 'super_denied' && e.type !== 'respawn') this.buf.push(e);
  }

  tick(snap: Snapshot | null) {
    if (!this.enabled || !snap || this.inflight) return;
    const now = performance.now();
    if (now - this.last < 3500 || !this.buf.length) return;
    if (snap.phase !== 'fight' && !this.buf.some((e) => e.type === 'ko' || e.type === 'match_over')) return;
    this.last = now;
    const summary = summarize(this.buf, snap);
    this.buf = [];
    this.inflight = true;
    fetch('/api/commentary', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary, voice: !muted }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.text) playLine(j.text, j.audio ?? null, j.source);
      })
      .catch(() => {})
      .finally(() => (this.inflight = false));
  }

  reset() {
    this.buf = [];
    this.last = performance.now();
  }
}
