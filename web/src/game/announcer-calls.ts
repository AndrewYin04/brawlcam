// Which announcer call to play (REVIEW.md 6:08 AM): round starts that mention the score, match results chosen by how
// the match went, and no repeats (any of the last 3 lines of the same moment, kept in localStorage across matches).
// Pure logic (no audio or DOM) so tests/unit/announcer-calls.ts can drive it with simulated event sequences.
import { DUEL_DEFAULTS, TUNING, type SimEvent, type Snapshot } from '../../../shared/sim';

export type Clip = { id: string; text: string };
export type CallMap = Record<string, Clip[]>;
export type StoreLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** KOs that count as "SUPER FINISH!": a super landed the last blow (the Iron Wall counter is a super too). */
const SUPER_KO = new Set(['super_uppercut', 'blast', 'throw', 'iron_counter']);
const WINS_TO_TAKE = DUEL_DEFAULTS.roundsToWin; // duels are best of 3 (the HUD pips assume it too)

export interface RoundRecord {
  n: number;
  winner: number | null;
  reason: 'ko' | 'time';
  /** Each fighter's HP when the round ended (HP never goes up during a round, so it is also their lowest). */
  hp: Record<number, number>;
}

/** Follows the match from its events and snapshots: who won each round, with how much HP left, and the last KO. */
export class MatchTracker {
  rounds: RoundRecord[] = [];
  /** Kind of the last KO this round (it can arrive after round_end: the hero renderer delays it to the contact frame). */
  koKind: string | null = null;

  onEvent(e: SimEvent, snap: Snapshot | null) {
    if (e.type === 'round_start') {
      if (e.n <= 1) this.rounds = [];
      this.koKind = null;
    } else if (e.type === 'ko') this.koKind = e.kind;
    else if (e.type === 'round_end') this.rounds.push({ n: e.n, winner: e.winner, reason: e.reason, hp: Object.fromEntries((snap?.f ?? []).map((f) => [f.id, f.hp])) });
  }

  /** After a KO and its round_end have both been seen: the result call if that KO round took the duel, else null, so a
   *  match-ending KO plays one call (REVIEW.md 7:58 AM). The sim emits ko then round_end in the same tick; the renderer
   *  may hold the KO for the contact frame, so the announcer asks once both have arrived. */
  koEnding(round: number, fighters: number): { slot: string; keys: string[] } | null {
    if (fighters !== 2) return null;
    const last = this.rounds[this.rounds.length - 1];
    if (!last || last.n !== round || last.reason !== 'ko' || last.winner == null) return null;
    if (this.rounds.filter((r) => r.winner === last.winner).length < WINS_TO_TAKE) return null;
    return matchEndKeys(this, last.winner, 'rounds', 2);
  }
}

/** Call keys for a round's "FIGHT!", most specific first. Brawls have one round and no score. */
export function roundStartKeys(snap: Snapshot | null): { slot: string; keys: string[] } {
  if (snap && snap.f.length > 2) return { slot: 'fight', keys: ['fight'] };
  const n = snap?.round ?? 1;
  const rw = snap && snap.f.length === 2 ? snap.f.map((f) => f.rw) : null;
  if (n <= 1) return { slot: 'round1', keys: ['round1'] };
  if (n === 2) {
    // One fighter is a round from taking the match.
    const mp = rw && Math.max(...rw) === WINS_TO_TAKE - 1 && Math.min(...rw) < Math.max(...rw);
    return { slot: 'round2', keys: mp ? ['match_point', 'round2'] : ['round2'] };
  }
  const tied = rw && rw[0] === WINS_TO_TAKE - 1 && rw[1] === WINS_TO_TAKE - 1; // one round each
  return { slot: 'round3', keys: tied ? ['decider', 'round3'] : ['round3'] };
}

/**
 * Context of a finished duel, most specific first (each has its own lines; 'match_over' is the generic fallback):
 * - mo_flawless: the winner took no damage in the final round
 * - mo_comeback: the winner lost round 1, or won with under 25% HP
 * - mo_super: a super landed the match-ending KO
 * - mo_close: it went to round 3, or the final round was won by under 10% HP
 * - mo_dominant: the loser took no round and the winner kept over 60% HP in every round it won
 * - mo_decision: the final round went the distance (time)
 */
export function matchEndContexts(t: MatchTracker, winner: number | null, reason: string, fighters: number): string[] {
  if (winner == null) return [];
  if (fighters !== 2 || (reason !== 'rounds' && reason !== 'max_rounds') || !t.rounds.length) return [];
  const last = t.rounds[t.rounds.length - 1];
  const opp = Number(Object.keys(last.hp).find((id) => Number(id) !== winner));
  const hpW = last.hp[winner] ?? 0;
  const hpL = Number.isFinite(opp) ? last.hp[opp] ?? 0 : 0;
  const won = t.rounds.filter((r) => r.winner === winner);
  const lostAny = t.rounds.some((r) => r.winner != null && r.winner !== winner);
  const out: string[] = [];
  if (last.winner === winner && hpW >= TUNING.hpMax) out.push('mo_flawless');
  if ((t.rounds[0].winner != null && t.rounds[0].winner !== winner) || hpW < 25) out.push('mo_comeback');
  if (last.reason === 'ko' && t.koKind && SUPER_KO.has(t.koKind)) out.push('mo_super');
  if (t.rounds.length >= 3 || hpW - hpL < 10) out.push('mo_close');
  if (!lostAny && won.length >= WINS_TO_TAKE && won.every((r) => (r.hp[winner] ?? 0) > 60)) out.push('mo_dominant');
  if (last.reason === 'time') out.push('mo_decision');
  return out;
}

/** The result call's keys: a draw, or the match's context lines followed by the generic ones. */
export function matchEndKeys(t: MatchTracker, winner: number | null, reason: string, fighters: number): { slot: string; keys: string[] } {
  if (winner == null) return { slot: 'draw', keys: ['draw'] };
  return { slot: 'match_over', keys: [...matchEndContexts(t, winner, reason, fighters), 'match_over'] };
}

const RECENT = 3; // avoid any of the last 3 lines used for the same moment
const KEEP = 6;

/** Picks a clip: the most specific key that still has a line not used recently for this moment (slot). */
export class CallPicker {
  private recent: Record<string, string[]> = {};
  /** The last clip played (any slot): never played twice in a row. */
  lastId = '';

  constructor(
    private store: StoreLike | null = null,
    private storeKey = 'throwhands.calls.recent',
  ) {
    try {
      const j = JSON.parse(store?.getItem(storeKey) ?? '{}');
      if (j && typeof j === 'object') for (const [k, v] of Object.entries(j)) if (Array.isArray(v)) this.recent[k] = v.filter((x) => typeof x === 'string').slice(-KEEP);
    } catch {
      this.recent = {};
    }
  }

  /** Recently used clip ids for a slot, oldest first. */
  history(slot: string) {
    return [...(this.recent[slot] ?? [])];
  }

  pick(calls: CallMap | null, slot: string, keys: string[], rng: () => number = Math.random): { key: string; clip: Clip } | null {
    if (!calls) return null;
    const groups = keys.map((key) => ({ key, clips: calls[key] ?? [] })).filter((g) => g.clips.length);
    const all = groups.flatMap((g) => g.clips.map((clip) => ({ key: g.key, clip })));
    if (!all.length) return null;
    const hist = this.recent[slot] ?? [];
    const n = Math.min(RECENT, all.length - 1); // a moment with fewer lines alternates instead of going silent
    const avoid = new Set(n > 0 ? hist.slice(-n) : []);
    if (all.length > 1) avoid.add(this.lastId);
    let choice: { key: string; clip: Clip } | null = null;
    for (const g of groups) {
      const ok = g.clips.filter((c) => !avoid.has(c.id));
      if (ok.length) {
        choice = { key: g.key, clip: ok[Math.min(ok.length - 1, Math.floor(rng() * ok.length))] };
        break;
      }
    }
    // Everything was used recently: the least recently used line (still never the one just played).
    if (!choice) {
      const pool = all.length > 1 ? all.filter((c) => c.clip.id !== this.lastId) : all;
      choice = pool.reduce((a, b) => (hist.lastIndexOf(b.clip.id) < hist.lastIndexOf(a.clip.id) ? b : a));
    }
    const id = choice.clip.id;
    this.recent[slot] = [...hist.filter((x) => x !== id), id].slice(-KEEP);
    this.lastId = id;
    try {
      this.store?.setItem(this.storeKey, JSON.stringify(this.recent));
    } catch {
      /* storage full or blocked: in-memory history still works for this page */
    }
    return choice;
  }
}
