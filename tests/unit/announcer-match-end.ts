// Match-end calls through the real Announcer (REVIEW.md 7:58 AM: "it's still saying 'what a fight' after every player
// wins"). Real bot-vs-bot duels from the shared sim, delivered the way web/src/game/view.ts delivers them: the snapshot,
// then every event except hits and KOs at once; a KO either with its batch (no pending hit) or held for the contact
// frame (after its round_end). Checks, per 10 match ends: >= 6 distinct results, never the same twice in a row, one call
// on a match-ending KO (no separate "K.O.!" first), and at most one "fight" word from the last KO through the rematch.
// Usage: npx tsx tests/unit/announcer-match-end.ts
import fs from 'fs';
import path from 'path';
import { Sim, type SimEvent } from '../../shared/sim';
import { Bot } from '../../shared/bot';

const ROOT = path.resolve(import.meta.dirname, '../..');
const callsJson = fs.readFileSync(path.join(ROOT, 'web/public/calls/calls.json'), 'utf8');
// Node has no audio: calls.json loads, every mp3 fetch fails (the call is still logged; nothing plays).
(globalThis as any).fetch = async (u: string) => (u === '/calls/calls.json' ? { ok: true, json: async () => JSON.parse(callsJson) } : { ok: false, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) });
const mem = new Map<string, string>();
(globalThis as any).window = { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } };
(globalThis as any).localStorage = (globalThis as any).window.localStorage;
const { Announcer, preloadCalls } = await import('../../web/src/game/announcer');
await preloadCalls();

let fail = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fail = true;
};
// Fake clock: the announcer paces calls on performance.now() and schedules the result with setTimeout.
let now = 0;
(globalThis as any).performance = { now: () => now };
const timers: { at: number; fn: () => void }[] = [];
(globalThis as any).setTimeout = (fn: () => void, ms: number) => (timers.push({ at: now + ms, fn }), timers.length);
(globalThis as any).clearTimeout = () => {};
const runTimers = () => {
  timers.sort((a, b) => a.at - b.at);
  while (timers.length && timers[0].at <= now) timers.shift()!.fn();
};

const ann = new Announcer();
const fightWords = (s: string) => (s.match(/\bfight\b/gi) ?? []).length;
const ends: { result: string; ctx: string; byKo: boolean; calls: string[] }[] = [];
for (let m = 0; m < 10; m++) {
  const sim = new Sim({ mode: 'duel', roundSeconds: 40 }, 300 + m);
  const bots = [1, 2].map((id) => (sim.addFighter({ id, name: 'Bot' + id, color: '#f00', bot: true }), new Bot(id, { seed: id * 17 + m, level: (m % 3) + 1 })));
  sim.start();
  const holdKo = m % 2 === 1; // odd matches: the KO waits for its contact frame (arrives after round_end)
  const from = ann.log.length;
  let lastKoAt = -1;
  let byKo = false;
  for (let steps = 0; steps < 30 * 60 * 8; steps++) {
    for (const b of bots) b.tick(sim);
    sim.step(1 / 30);
    now += 1000 / 30;
    const ev = sim.drainEvents();
    for (const b of bots) b.observe(ev, sim);
    const snap = sim.snapshot(false);
    const held: SimEvent[] = [];
    for (const e of ev) {
      if (e.type === 'hit') continue;
      if (e.type === 'ko') {
        lastKoAt = ann.log.length;
        if (holdKo) held.push(e);
        else ann.onEvent(e, snap);
        continue;
      }
      if (e.type === 'round_end') byKo = e.reason === 'ko';
      ann.onEvent(e, snap);
    }
    await Promise.resolve(); // the announcer decides a KO's call a microtask later
    for (const e of held) ann.onEvent(e, snap);
    await Promise.resolve();
    runTimers();
    if (sim.phase === 'match_over' && timers.length === 0) break;
  }
  // Let the result and the rematch prompt play out.
  for (let i = 0; i < 300; i++) ((now += 50), runTimers());
  const mine = ann.log.slice(from);
  const res = mine.filter((c) => c.key === 'match_over' || c.key === 'draw');
  const tail = ann.log.slice(Math.max(from, lastKoAt)).map((c) => c.text);
  ends.push({ result: res.map((c) => c.text).join(' + '), ctx: res.map((c) => c.ctx).join('+'), byKo, calls: tail });
  console.log(`     match ${m + 1} (${holdKo ? 'KO held to contact' : 'KO with its batch'}${byKo ? ', ended by KO' : ', ended on time'}): ${tail.join(' -> ')}`);
}
const results = ends.map((e) => e.result);
check(ends.every((e) => e.result && !e.result.includes(' + ')), `every match end plays exactly one result call (${ends.map((e) => e.result.split(' + ').length).join(',')})`);
check(new Set(results).size >= 6, `10 match ends: ${new Set(results).size} distinct results (>= 6): ${results.join(' / ')}`);
check(results.every((r, i) => i === 0 || r !== results[i - 1]), 'never the same result twice in a row');
const koEnds = ends.filter((e) => e.byKo);
check(koEnds.length >= 3 && koEnds.every((e) => !e.calls.some((t) => ['K.O.!', "IT'S OVER!", 'LIGHTS OUT!', 'GOOD NIGHT!'].includes(t))), `${koEnds.length} match-ending KOs: no separate KO call before the result (${koEnds.map((e) => e.calls.join(' -> ')).join(' | ')})`);
check(ends.every((e) => e.calls.reduce((n, t) => n + fightWords(t), 0) <= 1), `at most one "fight" from the last KO through the rematch prompt (${ends.map((e) => e.calls.reduce((n, t) => n + fightWords(t), 0)).join(',')})`);
check(ends.every((e) => e.calls.some((t) => t === 'RUN IT BACK?' || t === 'REMATCH?')), 'the rematch prompt follows every result');
const all = JSON.parse(callsJson).calls as Record<string, { text: string }[]>;
check(!['match_over', 'mo_flawless', 'mo_comeback', 'mo_super', 'mo_close', 'mo_dominant', 'mo_decision', 'filler', 'ko'].some((k) => all[k].some((c) => fightWords(c.text) > 0)), 'no result, filler or KO line says "fight"');
if (fail) process.exit(1);
console.log('announcer match end: all checks passed');
