// Announcer: instant pre-rendered stock calls (ElevenLabs, served from /calls/) on big moments, plus crowd reactions.
// At most one call every 2.2 s and 8 per minute, except round starts, KOs and the match result, which always play.
import type { SimEvent, Snapshot } from '../../../shared/sim';
import * as sfx from './audio';

type CallMap = Record<string, { id: string; text: string }[]>;
let calls: CallMap | null = null;
let loading: Promise<void> | null = null;
/**
 * Fetch the call list and decode every call (~1.6 MB). Started by boot() once the fighters and the pose model have
 * downloaded: fetched at import time, these ~70 files shared a slow link with the models and held the loading bar
 * at 0% for the first 30+ s on Slow 3G.
 */
export function preloadCalls(): Promise<void> {
  loading ??= fetch('/calls/calls.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      calls = j?.calls ?? null;
      if (calls) for (const list of Object.values(calls)) for (const c of list) void sfx.loadBuffer(`/calls/${c.id}.mp3`);
    })
    .catch(() => {});
  return loading;
}

const ALWAYS = new Set(['round1', 'round2', 'round3', 'fight', 'ko', 'match_over', 'draw', 'time']);
// Big moments need only 1 s since the last call (they shouldn't be swallowed by a round-start call).
const BIG = new Set(['guard_break', 'ironwall', 'counter', 'super_uppercut', 'cage', 'blast', 'throw']);

export class Announcer {
  private lastAt = -99;
  private recent: number[] = [];
  private lastId = '';
  private hitTimes = new Map<number, number[]>();
  private lowHpCalled = new Set<number>();
  private chant = false;
  /** Log of calls played (tests/review). */
  log: { at: number; key: string; text: string; id: string }[] = [];
  enabled = true;

  /** True when a stock call played in the last `sec` seconds (the AI line then stays caption-only). */
  spokeWithin(sec: number) {
    return performance.now() / 1000 - this.lastAt < sec;
  }
  /** Spoken lines in the last minute (stock calls), for the AI voice budget. */
  spokenLastMinute() {
    const now = performance.now() / 1000;
    return this.recent.filter((t) => now - t < 60).length;
  }

  private say(key: string, text?: (t: string) => void) {
    if (!this.enabled || !calls?.[key]?.length) return false;
    const now = performance.now() / 1000;
    this.recent = this.recent.filter((t) => now - t < 60);
    if (!ALWAYS.has(key) && (now - this.lastAt < (BIG.has(key) ? 1.0 : 2.2) || this.recent.length >= 8)) return false;
    const opts = calls[key].filter((c) => c.id !== this.lastId);
    const pick = (opts.length ? opts : calls[key])[Math.floor(Math.random() * (opts.length || calls[key].length))];
    void sfx.loadBuffer(`/calls/${pick.id}.mp3`).then((buf) => buf && sfx.playVoiceBuffer(buf));
    this.lastAt = now;
    this.recent.push(now);
    this.lastId = pick.id;
    this.log.push({ at: Date.now(), key, text: pick.text, id: pick.id });
    if (this.log.length > 200) this.log.shift();
    text?.(pick.text);
    return true;
  }

  /** A pre-voiced generic roast (roast_* keys), under the same pacing as the other calls. */
  roast(key: string) {
    return key.startsWith('roast_') && this.say(key);
  }

  /** One event as it is shown on screen (hits arrive at the contact frame). */
  onEvent(e: SimEvent, snap: Snapshot | null) {
    const t = performance.now() / 1000;
    switch (e.type) {
      case 'round_start':
        this.lowHpCalled.clear();
        this.setChant(false);
        sfx.crowdStart();
        break;
      case 'fight': {
        const n = snap?.round ?? 1;
        if (!this.say(snap && snap.f.length > 2 ? 'fight' : n >= 3 ? 'round3' : n === 2 ? 'round2' : 'round1')) this.say('fight');
        sfx.crowdRoar(0.5);
        break;
      }
      case 'hit': {
        if (e.blocked) {
          if (e.damage >= 2 || e.isSuper) {
            sfx.crowdOoh();
            if (e.isSuper) this.say('blocked');
          }
          break;
        }
        const list = (this.hitTimes.get(e.attacker) ?? []).filter((x) => t - x < 1.6);
        list.push(t);
        this.hitTimes.set(e.attacker, list);
        if (e.kind === 'super_uppercut') {
          this.say('super_uppercut');
          sfx.crowdRoar(1);
        } else if (list.length >= 3) {
          this.say('combo');
          this.hitTimes.set(e.attacker, []);
          sfx.crowdRoar(0.7);
        } else if (e.damage >= 12) {
          this.say('big_hit');
          sfx.crowdRoar(0.6);
        }
        const tgt = snap?.f.find((f) => f.id === e.target);
        if (tgt && tgt.hp > 0 && tgt.hp <= 25 && !this.lowHpCalled.has(e.target)) {
          this.lowHpCalled.add(e.target);
          setTimeout(() => this.say('low_hp'), 900);
          if (snap && snap.f.length <= 2) this.setChant(true);
        }
        break;
      }
      case 'guard_break':
        this.say('guard_break');
        sfx.crowdGasp();
        break;
      case 'cage':
        if (e.speed > 3) {
          this.say('cage');
          sfx.crowdRoar(0.9);
        }
        break;
      case 'super':
        if (e.kind === 'ironwall') this.say('ironwall');
        else if (e.kind === 'blast') this.say('blast');
        break;
      case 'clinch_start' as any:
        this.say('clinch');
        break;
      case 'throw' as any:
        this.say('throw');
        sfx.crowdRoar(1);
        break;
      case 'iron_counter':
        this.say('counter');
        sfx.crowdRoar(0.7);
        break;
      case 'ko':
        this.say('ko');
        sfx.crowdRoar(1);
        this.setChant(false);
        break;
      case 'round_end':
        setTimeout(() => sfx.roundSting(), 1500);
        if ((e as any).reason === 'time') this.say('time');
        break;
      case 'match_over':
        setTimeout(() => this.say(e.winner == null ? 'draw' : 'match_over'), 1200);
        sfx.crowdRoar(1);
        this.setChant(false);
        break;
    }
  }

  private meterReady = new Set<number>();
  /** Per frame: "super ready" when your meter fills, and a short filler call when the fight has gone quiet. */
  tick(snap: Snapshot | null, localIds: number[]) {
    if (!snap || snap.phase !== 'fight') return;
    for (const f of snap.f) {
      if (!localIds.includes(f.id)) continue;
      if (f.meter >= 100 && !this.meterReady.has(f.id)) {
        this.meterReady.add(f.id);
        this.say('meter_ready');
      } else if (f.meter < 100) this.meterReady.delete(f.id);
    }
    const now = performance.now() / 1000;
    if (now - this.lastAt > 9 && now - this.lastFiller > 9) {
      this.lastFiller = now;
      this.say('filler');
    }
  }
  private lastFiller = 0;

  private setChant(on: boolean) {
    if (on === this.chant) return;
    this.chant = on;
    sfx.crowdChant(on);
  }

  stop() {
    this.setChant(false);
    sfx.crowdStop();
  }
}
