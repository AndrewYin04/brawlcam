// Announcer line selection (REVIEW.md 6:08 AM): context-aware round starts and match results, no repeats of the last
// 3 lines for the same moment (persisted across page loads), never the same clip twice in a row.
// Usage: npx tsx tests/unit/announcer-calls.ts
import fs from 'fs';
import path from 'path';
import { CallPicker, MatchTracker, matchEndContexts, matchEndKeys, roundStartKeys, type CallMap, type StoreLike } from '../../web/src/game/announcer-calls';
import { Sim, type SimEvent, type Snapshot } from '../../shared/sim';
import { Bot } from '../../shared/bot';

const ROOT = path.resolve(import.meta.dirname, '../..');
const calls: CallMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/public/calls/calls.json'), 'utf8')).calls;
let fail = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fail = true;
};
const memStore = (): StoreLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
let seed = 7;
const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// Every clip referenced by the logic exists, with its mp3.
for (const k of ['round1', 'round2', 'round3', 'match_point', 'decider', 'fight', 'match_over', 'draw', 'time', 'rematch', 'mo_flawless', 'mo_comeback', 'mo_super', 'mo_close', 'mo_dominant', 'mo_decision'])
  check(!!calls[k]?.length && calls[k].every((c) => fs.existsSync(path.join(ROOT, 'web/public/calls', c.id + '.mp3'))), `calls.json has "${k}" (${calls[k]?.map((c) => c.text).join(' | ')}) with mp3s`);

// ---- simulated event sequences (as the view delivers them: the snapshot after the step, then its events) ----
const snapOf = (round: number, hp: [number, number], rw: [number, number], extra = 0) =>
  ({ round, f: [{ id: 1, hp: hp[0], rw: rw[0] }, { id: 2, hp: hp[1], rw: rw[1] }, ...Array.from({ length: extra }, (_, i) => ({ id: 3 + i, hp: 100, rw: 0 }))] }) as unknown as Snapshot;
type R = { w: 1 | 2 | null; hp: [number, number]; reason?: 'ko' | 'time'; ko?: string; koAfterEnd?: boolean };
/** Feeds a duel's rounds into a tracker; returns it and the match_over event. */
function playMatch(rounds: R[], reason = 'rounds') {
  const t = new MatchTracker();
  const rw: [number, number] = [0, 0];
  rounds.forEach((r, i) => {
    const n = i + 1;
    t.onEvent({ type: 'round_start', n }, snapOf(n, [100, 100], rw));
    t.onEvent({ type: 'fight' }, snapOf(n, [100, 100], rw));
    const why = r.reason ?? 'ko';
    if (r.w) rw[r.w - 1]++;
    const end = snapOf(n, r.hp, rw);
    const ko: SimEvent = { type: 'ko', attacker: r.w, target: r.w === 1 ? 2 : 1, kind: r.ko ?? 'jab', ringout: false };
    if (why === 'ko' && !r.koAfterEnd) t.onEvent(ko, end);
    t.onEvent({ type: 'round_end', n, winner: r.w, reason: why }, end);
    if (why === 'ko' && r.koAfterEnd) t.onEvent(ko, end); // hero renderer: the KO lands on screen after round_end
  });
  const winner = rw[0] > rw[1] ? 1 : rw[1] > rw[0] ? 2 : null;
  return { t, e: { type: 'match_over' as const, winner, reason } };
}
const firstCtx = (rounds: R[], reason = 'rounds', fighters = 2) => {
  const { t, e } = playMatch(rounds, reason);
  const end = matchEndKeys(t, e.winner, e.reason, fighters);
  const pick = new CallPicker(memStore()).pick(calls, end.slot, end.keys, rng);
  return { slot: end.slot, keys: end.keys, ctx: pick?.key, text: pick?.clip.text };
};
const CASES: { name: string; rounds: R[]; reason?: string; fighters?: number; want: string; slot?: string }[] = [
  { name: 'flawless: 2-0, no damage taken in the final round', rounds: [{ w: 1, hp: [70, 0] }, { w: 1, hp: [100, 0] }], want: 'mo_flawless' },
  { name: 'comeback: lost round 1, won 2 and 3', rounds: [{ w: 2, hp: [0, 40] }, { w: 1, hp: [55, 0] }, { w: 1, hp: [48, 0] }], want: 'mo_comeback' },
  { name: 'comeback: won the deciding round on 18 HP', rounds: [{ w: 1, hp: [50, 0] }, { w: 1, hp: [18, 0] }], want: 'mo_comeback' },
  { name: 'KO by super (super uppercut ends it)', rounds: [{ w: 1, hp: [45, 0] }, { w: 1, hp: [50, 0], ko: 'super_uppercut' }], want: 'mo_super' },
  { name: 'KO by super when the KO lands after round_end (hero renderer)', rounds: [{ w: 1, hp: [45, 0] }, { w: 1, hp: [50, 0], ko: 'blast', koAfterEnd: true }], want: 'mo_super' },
  { name: 'KO by Iron Wall counter counts as a super finish', rounds: [{ w: 2, hp: [0, 30] }, { w: 1, hp: [40, 0] }, { w: 1, hp: [44, 0], ko: 'iron_counter' }], want: 'mo_comeback' },
  { name: 'close: won round 1, lost round 2, won round 3', rounds: [{ w: 1, hp: [40, 0] }, { w: 2, hp: [0, 30] }, { w: 1, hp: [45, 0] }], want: 'mo_close' },
  { name: 'close: time-out decision by 6 HP', rounds: [{ w: 1, hp: [50, 0] }, { w: 1, hp: [46, 40], reason: 'time' }], want: 'mo_close' },
  { name: 'blowout: 2-0 with 80 and 70 HP left', rounds: [{ w: 1, hp: [80, 0] }, { w: 1, hp: [70, 0] }], want: 'mo_dominant' },
  { name: 'time-out decision (not close)', rounds: [{ w: 1, hp: [50, 0] }, { w: 1, hp: [55, 20], reason: 'time' }], want: 'mo_decision' },
  { name: 'ordinary 2-0 -> generic line', rounds: [{ w: 1, hp: [40, 0] }, { w: 1, hp: [45, 0] }], want: 'match_over' },
  { name: 'player 2 wins a blowout', rounds: [{ w: 2, hp: [0, 90] }, { w: 2, hp: [0, 75] }], want: 'mo_dominant' },
  { name: 'opponent left -> generic line', rounds: [{ w: 1, hp: [100, 0] }], reason: 'opponent_left', want: 'match_over' },
  { name: 'brawl -> generic line', rounds: [{ w: 1, hp: [100, 0] }], reason: 'time', fighters: 8, want: 'match_over' },
  { name: 'draw', rounds: [{ w: 1, hp: [50, 0] }, { w: 2, hp: [0, 50] }, { w: null, hp: [30, 30], reason: 'time' }], reason: 'max_rounds', want: 'draw', slot: 'draw' },
];
for (const c of CASES) {
  const r = firstCtx(c.rounds, c.reason, c.fighters);
  check(r.ctx === c.want && r.slot === (c.slot ?? 'match_over'), `${c.name} -> ${r.ctx} "${r.text}" (keys ${r.keys.join(',')})`);
}
// The context list itself (all that apply, most specific first).
{
  const { t } = playMatch([{ w: 2, hp: [0, 40] }, { w: 1, hp: [55, 0] }, { w: 1, hp: [100, 0], ko: 'super_uppercut' }]);
  const ctx = matchEndContexts(t, 1, 'rounds', 2);
  check(JSON.stringify(ctx) === JSON.stringify(['mo_flawless', 'mo_comeback', 'mo_super', 'mo_close']), `all contexts of a flawless super-KO comeback in round 3: ${ctx.join(', ')}`);
  const again = playMatch([{ w: 1, hp: [80, 0] }, { w: 1, hp: [90, 0] }]);
  check(JSON.stringify(matchEndContexts(again.t, 1, 'rounds', 2)) === '["mo_dominant"]', 'a rematch resets the tracker (round 1 starts a new match)');
}

// Round starts that mention the score.
const rs = (round: number, rw: [number, number], extra = 0) => roundStartKeys(snapOf(round, [100, 100], rw, extra));
check(JSON.stringify(rs(1, [0, 0])) === '{"slot":"round1","keys":["round1"]}', 'round 1 -> round1');
check(JSON.stringify(rs(2, [1, 0]).keys) === '["match_point","round2"]' && new CallPicker(memStore()).pick(calls, 'round2', rs(2, [1, 0]).keys)?.key === 'match_point', 'round 2 at 1-0 -> "MATCH POINT! ROUND TWO!" first');
check(JSON.stringify(rs(2, [0, 1]).keys) === '["match_point","round2"]', 'round 2 at 0-1 -> match point too');
check(JSON.stringify(rs(2, [0, 0]).keys) === '["round2"]', 'round 2 after a drawn round 1 -> plain round 2');
check(JSON.stringify(rs(3, [1, 1]).keys) === '["decider","round3"]' && new CallPicker(memStore()).pick(calls, 'round3', rs(3, [1, 1]).keys)?.clip.text === 'ONE ROUND EACH... THIS DECIDES IT!', 'round 3 at 1-1 -> "ONE ROUND EACH... THIS DECIDES IT!" first');
check(JSON.stringify(rs(3, [1, 0]).keys) === '["round3"]', 'round 3 at 1-0 (a drawn round) -> final round');
check(JSON.stringify(rs(1, [0, 0], 6)) === '{"slot":"fight","keys":["fight"]}', 'brawl -> fight');

// ---- no repeats ----
/** n consecutive match ends of one shape through one picker (one page), returning the lines. */
const series = (picker: CallPicker, rounds: R[], n: number) =>
  Array.from({ length: n }, () => {
    const { t, e } = playMatch(rounds);
    const end = matchEndKeys(t, e.winner, e.reason, 2);
    const p = picker.pick(calls, end.slot, end.keys, rng)!;
    picker.pick(calls, 'rematch', ['rematch'], rng); // the rematch prompt plays between results
    return p.clip.text;
  });
const noRepeatIn3 = (xs: string[]) => xs.every((x, i) => !xs.slice(Math.max(0, i - 3), i).includes(x));
for (const [name, rounds] of [
  ['ordinary 2-0 (generic only)', [{ w: 1, hp: [40, 0] }, { w: 1, hp: [45, 0] }]],
  ['flawless blowout', [{ w: 1, hp: [90, 0] }, { w: 1, hp: [100, 0] }]],
  ['comeback', [{ w: 2, hp: [0, 40] }, { w: 1, hp: [55, 0] }, { w: 1, hp: [48, 0] }]],
  ['time-out decision', [{ w: 1, hp: [50, 0] }, { w: 1, hp: [55, 20], reason: 'time' }]],
] as [string, R[]][]) {
  const lines = series(new CallPicker(memStore()), rounds, 5);
  check(new Set(lines).size >= 4 && noRepeatIn3(lines), `5 consecutive "${name}" match ends: ${new Set(lines).size} distinct, none of the last 3 repeated: ${lines.join(' / ')}`);
}
{
  // Mixed outcomes over 10 matches.
  const p = new CallPicker(memStore());
  const shapes: R[][] = [CASES[0].rounds, CASES[1].rounds, CASES[8].rounds, CASES[10].rounds, CASES[6].rounds];
  const lines = Array.from({ length: 10 }, (_, i) => series(p, shapes[i % shapes.length], 1)[0]);
  const windows = lines.slice(0, 6).map((_, i) => new Set(lines.slice(i, i + 5)).size);
  check(windows.every((n) => n >= 4) && noRepeatIn3(lines), `10 mixed match ends: every 5 in a row has >= 4 distinct (${windows.join(',')}), none of the last 3 repeated: ${lines.join(' / ')}`);
}
{
  // Persisted: a new page (new picker on the same localStorage) still avoids the last 3 results.
  const store = memStore();
  const rounds: R[] = [{ w: 1, hp: [40, 0] }, { w: 1, hp: [45, 0] }];
  const a = series(new CallPicker(store), rounds, 3);
  const b = series(new CallPicker(store), rounds, 1);
  check(!a.includes(b[0]) && store.data.has('throwhands.calls.recent'), `after a reload the next result avoids the last 3 (${a.join(' / ')} -> ${b[0]})`);
  const bad = memStore();
  bad.setItem('throwhands.calls.recent', '{not json');
  check(!!new CallPicker(bad).pick(calls, 'round1', ['round1']), 'corrupt stored history is ignored');
  const throwing: StoreLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  check(!!new CallPicker(throwing).pick(calls, 'round1', ['round1']), 'blocked localStorage: calls still play');
}
{
  // Round starts alternate across matches; time and rematch alternate; single-clip keys still play; no clip twice in a row.
  const p = new CallPicker(memStore());
  const r1 = Array.from({ length: 4 }, () => p.pick(calls, 'round1', ['round1'], rng)!.clip.text);
  check(r1.every((x, i) => i === 0 || x !== r1[i - 1]), `round 1 starts over 4 matches never repeat back to back: ${r1.join(' / ')}`);
  const r3 = Array.from({ length: 4 }, () => p.pick(calls, 'round3', ['decider', 'round3'], rng)!.clip.text);
  check(r3.every((x, i) => i === 0 || x !== r3[i - 1]), `deciding-round starts alternate: ${r3.join(' / ')}`);
  const tm = Array.from({ length: 4 }, () => p.pick(calls, 'time', ['time'], rng)!.clip.text);
  check(tm.every((x, i) => i === 0 || x !== tm[i - 1]), `time calls alternate: ${tm.join(' / ')}`);
  const c = Array.from({ length: 3 }, () => p.pick(calls, 'counter', ['counter'], rng)?.clip.id);
  check(c.every((x) => x === 'counter_0'), 'a key with one line still plays every time');
  let prev = '';
  let back2back = 0;
  const kos: string[] = [];
  for (let i = 0; i < 200; i++) {
    const k = ['ko', 'big_hit', 'combo', 'filler', 'low_hp'][Math.floor(rng() * 5)];
    const id = p.pick(calls, k, [k], rng)!.clip.id;
    if (id === prev) back2back++;
    if (k === 'ko') kos.push(id);
    prev = id;
  }
  check(back2back === 0 && noRepeatIn3(kos), `200 in-match calls: ${back2back} back-to-back repeats; KO calls never repeat one of the last 3 (${kos.length} KOs)`);
}

// ---- real bot-vs-bot duels from the shared sim ----
{
  const picker = new CallPicker(memStore());
  const lines: string[] = [];
  let agree = 0;
  const N = 6;
  for (let m = 0; m < N; m++) {
    const sim = new Sim({ mode: 'duel', roundSeconds: 40 }, 100 + m);
    const bots = [1, 2].map((id) => (sim.addFighter({ id, name: 'Bot' + id, color: '#f00', bot: true }), new Bot(id, { seed: id * 31 + m, level: (m % 3) + 1 })));
    const tracker = new MatchTracker();
    const truth: { winner: number | null; hp: Record<number, number> }[] = [];
    let line = '';
    let ctx: string[] = [];
    sim.start();
    tracker.onEvent({ type: 'round_start', n: 1 }, sim.snapshot(false));
    for (let steps = 0; sim.phase !== 'match_over' && steps < 30 * 60 * 6; steps++) {
      for (const b of bots) b.tick(sim);
      sim.step(1 / 30);
      const ev = sim.drainEvents();
      for (const b of bots) b.observe(ev, sim);
      const snap = sim.snapshot(false);
      for (const e of ev) {
        tracker.onEvent(e, snap);
        if (e.type === 'round_end') truth.push({ winner: e.winner, hp: Object.fromEntries(sim.fighters.map((f) => [f.id, f.hp])) });
        if (e.type === 'match_over') {
          const end = matchEndKeys(tracker, e.winner, e.reason, 2);
          ctx = end.keys;
          line = picker.pick(calls, end.slot, end.keys, rng)!.clip.text;
        }
      }
    }
    const same = JSON.stringify(tracker.rounds.map((r) => ({ winner: r.winner, hp: r.hp }))) === JSON.stringify(truth);
    if (same) agree++;
    lines.push(line);
    console.log(`     sim duel ${m + 1}: rounds ${truth.map((r) => `${r.winner ?? 'draw'}(${Object.values(r.hp).map((h) => Math.round(h)).join('-')})`).join(' ')} -> ${ctx.join(',')} -> "${line}"`);
  }
  check(agree === N, `tracker matches the sim's round winners and HP in ${agree}/${N} real duels`);
  check(lines.every(Boolean) && new Set(lines.slice(0, 5)).size >= 4 && noRepeatIn3(lines), `5 consecutive real sim match ends: ${new Set(lines.slice(0, 5)).size} distinct lines`);
}
if (fail) process.exitCode = 1;
