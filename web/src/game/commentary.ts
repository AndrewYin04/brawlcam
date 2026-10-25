// Live fight commentator: batches game events every few seconds into one hype line (Gemini), spoken aloud.
import type { SimEvent, Snapshot } from '../../../shared/sim';
import { summarize } from '../../../shared/commentary';
import { setVoiceMuted, volumes } from './audio';

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
  setVoiceMuted(m);
  if (m) currentAudio?.pause();
  $('btn-mute').textContent = m ? '🔇' : '🔊';
}

let currentAudio: HTMLAudioElement | null = null;
/** Live AI lines are captions; spoken commentary comes from the verified stock calls. ?livevoice=1 re-enables Gemini TTS
 *  (its delivery prompt was read aloud in the user's test and could not be re-verified: free-tier TTS quota). */
const LIVE_VOICE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('livevoice');
/** Set by the app: false while the announcer just called a big moment or the spoken-line budget is used up. */
export let voiceAllowed: () => boolean = () => true;
export function setVoiceGate(f: () => boolean) {
  voiceAllowed = f;
}
let hideTimer: number | undefined;
export const commentaryLog: { at: number; text: string; source: string; spoken: 'tts' | 'browser' | 'muted' | 'none' }[] = [];

/** Show and speak one line. audio is a data URL from Gemini TTS, or null to use the browser voice. */
export function playLine(text: string, audio: string | null, source = '') {
  const el = $('commentary');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
  // Voiced only with real TTS audio; otherwise the line is a caption (the flat browser voice is gone).
  let spoken: 'tts' | 'browser' | 'muted' | 'none' = 'none';
  if (muted) spoken = 'muted';
  else if (audio && LIVE_VOICE && voiceAllowed()) {
    try {
      currentAudio?.pause();
      currentAudio = new Audio(audio);
      currentAudio.volume = volumes.voice;
      void currentAudio.play().catch(() => {});
      spoken = 'tts';
    } catch {}
  }
  commentaryLog.push({ at: Date.now(), text, source, spoken });
  if (commentaryLog.length > 200) commentaryLog.shift();
}

/** Local-mode commentator: asks the API server every ~3.5 s when something happened. */
export class Commentator {
  private buf: SimEvent[] = [];
  private last = 0;
  private inflight = false;
  enabled = true;
  /** Whether this line may be voiced (the announcer's stock calls cover big moments; keep to ~6-8 spoken lines/min). */
  mayVoice: () => boolean = () => true;

  push(events: SimEvent[]) {
    for (const e of events) if (e.type !== 'whiff' && e.type !== 'super_denied' && e.type !== 'respawn') this.buf.push(e);
  }

  tick(snap: Snapshot | null) {
    if (!this.enabled || !snap || this.inflight) return;
    const now = performance.now();
    if (now - this.last < 5000 || !this.buf.length) return;
    if (snap.phase !== 'fight' && !this.buf.some((e) => e.type === 'ko' || e.type === 'match_over')) return;
    this.last = now;
    const summary = summarize(this.buf, snap);
    this.buf = [];
    this.inflight = true;
    fetch('/api/commentary', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary, voice: LIVE_VOICE && !muted && this.mayVoice() }) })
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
