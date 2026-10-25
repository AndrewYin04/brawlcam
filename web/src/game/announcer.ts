// Announcer: instant pre-rendered stock calls (ElevenLabs, served from /calls/) on big moments, plus crowd reactions.
// At most one call every 2.2 s and 8 per minute, except round starts, KOs and the match result, which always play.
// Which line plays (context, no repeats) is decided in announcer-calls.ts.
import type { SimEvent, Snapshot } from '../../../shared/sim';
import * as sfx from './audio';
import { CallPicker, MatchTracker, matchEndKeys, roundStartKeys, type CallMap } from './announcer-calls';

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

const ALWAYS = new Set(['round1', 'round2', 'round3', 'fight', 'ko', 'match_over', 'draw', 'time', 'rematch']);
// Big moments need only 1 s since the last call (they shouldn't be swallowed by a round-start call).
const BIG = new Set(['guard_break', 'ironwall', 'counter', 'super_uppercut', 'cage', 'blast', 'throw']);
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
/** Recent lines per moment, kept across matches (no repeats of the last 3). One per page: the menu's bot exhibition and
 *  the match each have an Announcer, and both count. */
const picker = new CallPicker(storage);

export class Announcer {
  private lastAt = -99;
  private recent: number[] = [];
  /** Round winners and HP, for the context of the round-start and result calls. */
  private match = new MatchTracker();
  /** The result and rematch calls wait a moment; a new round (rematch) or leaving the match cancels them. */
  private timers: ReturnType<typeof setTimeout>[] = [];
  /** The match result was already called at the match-ending KO (one call, not "K.O.!" then the result). */
  private resultCalled = false;
  private matchEnded = false;
  private hitTimes = new Map<number, number[]>();
  private lowHpCalled = new Set<number>();
  private chant = false;
  /** Log of calls played (tests/review). key: the moment (e.g. match_over); ctx: the line's group (e.g. mo_comeback). */
  log: { at: number; key: string; ctx: string; text: string; id: string }[] = [];
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

  /** Play a line for moment `key`, from the most specific of `keys` that has a line not used recently. */
  private say(key: string, keys: string[] = [key], onEnd?: (sec: number) => void) {
    if (!this.enabled || !calls || !keys.some((k) => calls![k]?.length)) return false;
    const now = performance.now() / 1000;
    this.recent = this.recent.filter((t) => now - t < 60);
    if (!ALWAYS.has(key) && (now - this.lastAt < (BIG.has(key) ? 1.0 : 2.2) || this.recent.length >= 8)) return false;
    const pick = picker.pick(calls, key, keys);
    if (!pick) return false;
    void sfx.loadBuffer(`/calls/${pick.clip.id}.mp3`).then((buf) => {
      if (!buf) return;
      const sec = sfx.playVoiceBuffer(buf); // always play; onEnd?.(play()) would skip the play when there is no onEnd
      onEnd?.(sec);
    });
    this.lastAt = now;
    this.recent.push(now);
    this.log.push({ at: Date.now(), key, ctx: pick.key, text: pick.clip.text, id: pick.clip.id });
    if (this.log.length > 200) this.log.shift();
    return true;
  }

  private later(ms: number, fn: () => void) {
    const id = setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== id);
      fn();
    }, ms);
    this.timers.push(id);
  }

  private clearTimers() {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
  }

  /** A pre-voiced generic roast (roast_* keys), under the same pacing as the other calls. */
  roast(key: string) {
    return key.startsWith('roast_') && this.say(key);
  }

  /** One event as it is shown on screen (hits arrive at the contact frame). */
  onEvent(e: SimEvent, snap: Snapshot | null) {
    const t = performance.now() / 1000;
    this.match.onEvent(e, snap);
    switch (e.type) {
      case 'round_start':
        this.clearTimers();
        this.resultCalled = false;
        this.matchEnded = false;
        this.lowHpCalled.clear();
        this.setChant(false);
        sfx.crowdStart();
        break;
      case 'fight': {
        // Round two of a 1-0 match is match point; round three at one round each decides it.
        const start = roundStartKeys(snap);
        if (!this.say(start.slot, start.keys)) this.say('fight');
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
      case 'ko': {
        // A KO that takes the match plays only the result line (REVIEW.md 7:58 AM); other KOs get a KO call. Decided a
        // microtask later: the sim's round_end for this KO is in the same event batch, right after it.
        const round = snap?.round ?? 0;
        const fighters = snap?.f.length ?? 2;
        queueMicrotask(() => {
          if (this.matchEnded || this.resultCalled) return;
          const end = this.match.koEnding(round, fighters);
          if (end) this.resultCalled = this.say(end.slot, end.keys);
          else this.say('ko');
        });
        sfx.crowdRoar(1);
        this.setChant(false);
        break;
      }
      case 'round_end':
        setTimeout(() => sfx.roundSting(), 1500);
        if ((e as any).reason === 'time') this.say('time');
        break;
      case 'match_over': {
        // The result line fits how the match went (comeback, flawless, close...), then a rematch prompt once it ends.
        this.matchEnded = true;
        if (this.resultCalled) this.later(1200, () => this.say('rematch'));
        else {
          const end = matchEndKeys(this.match, e.winner, e.reason, snap?.f.length ?? 2);
          this.later(1200, () => this.say(end.slot, end.keys, (sec) => this.later(sec * 1000 + 600, () => this.say('rematch'))));
        }
        sfx.crowdRoar(1);
        this.setChant(false);
        break;
      }
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
    this.clearTimers();
    this.setChant(false);
    sfx.crowdStop();
  }
}
