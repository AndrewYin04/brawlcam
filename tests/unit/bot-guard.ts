// Bots use the guard: over bot-vs-bot duels they block hits, release to refill, and sometimes hold too long and
// get guard-broken (so the mechanic shows up in practice matches and in the review video). Deterministic per seed.
import { Sim } from '../../shared/sim';
import { Bot } from '../../shared/bot';

let fail = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fail = true;
};

function duel(seed: number, level: number) {
  const sim = new Sim({ mode: 'duel' }, seed);
  const bots: Bot[] = [];
  for (const id of [1, 2]) {
    sim.addFighter({ id, name: 'Bot' + id, color: '#f00', bot: true });
    bots.push(new Bot(id, { level, seed: seed * 17 + id }));
  }
  sim.start();
  const st = { blocked: 0, hits: 0, breaks: 0, dizzyAttacks: 0, guardFrames: 0, frames: 0, minGuard: 100, refills: 0, ironWalls: 0, counters: 0, simS: 0 };
  let prevGuard = [100, 100];
  for (let i = 0; i < 30 * 120 && sim.phase !== 'match_over'; i++) {
    for (const b of bots) b.tick(sim);
    sim.step(1 / 30);
    const ev = sim.drainEvents();
    for (const b of bots) b.observe(ev, sim);
    for (const e of ev) {
      if (e.type === 'hit') {
        st.hits++;
        if (e.blocked) st.blocked++;
        const a = sim.get(e.attacker)!;
        // an attack resolved this tick by a fighter who was dizzy before it would be a bug
        if (a.dizzyUntil > 0 && a.atk && a.atk.t === sim.t && !e.kind.startsWith('blast')) st.dizzyAttacks++;
      }
      if (e.type === 'guard_break') st.breaks++;
      if (e.type === 'super' && e.kind === 'ironwall') st.ironWalls++;
      if (e.type === 'iron_counter') st.counters++;
    }
    sim.fighters.forEach((f, k) => {
      if (sim.phase === 'fight') st.frames++;
      if (f.blocking) st.guardFrames++;
      st.minGuard = Math.min(st.minGuard, f.guard);
      if (f.guard > prevGuard[k] + 0.01 && f.dizzyUntil === 0) st.refills++;
      prevGuard[k] = f.guard;
    });
  }
  st.simS = +sim.t.toFixed(1);
  return st;
}

const tot = { blocked: 0, hits: 0, breaks: 0, dizzyAttacks: 0, guardFrames: 0, frames: 0, refills: 0, ironWalls: 0, counters: 0, matchesWithBreak: 0 };
const N = 12;
for (let seed = 1; seed <= N; seed++) {
  const st = duel(seed, 1);
  console.log(`seed ${seed}: ${JSON.stringify(st)}`);
  for (const k of Object.keys(tot) as (keyof typeof tot)[]) if (k in st) (tot as any)[k] += (st as any)[k];
  if (st.breaks > 0) tot.matchesWithBreak++;
}
console.log('totals (normal bots, duel):', JSON.stringify(tot));
const guardShare = tot.guardFrames / tot.frames;
check(tot.blocked / tot.hits > 0.1, `bots block a real share of hits: ${tot.blocked}/${tot.hits} blocked`);
check(guardShare > 0.03 && guardShare < 0.5, `bots guard sometimes, not always: guard up ${(guardShare * 100).toFixed(1)}% of fighter-frames`);
check(tot.refills > 0, 'guard meters refill between guards');
check(tot.matchesWithBreak >= N / 3, `bots sometimes get guard-broken: ${tot.matchesWithBreak}/${N} duels had a guard break (${tot.breaks} total)`);
check(tot.dizzyAttacks === 0, 'no attacks from a dizzy fighter');

// Determinism: same seed, same result.
check(JSON.stringify(duel(3, 1)) === JSON.stringify(duel(3, 1)), 'bot guard behaviour is deterministic per seed');

// The passive dummy (level -1) never guards.
{
  const sim = new Sim({ mode: 'duel' }, 4);
  sim.addFighter({ id: 1, name: 'P', color: '#f00' });
  sim.addFighter({ id: 2, name: 'Dummy', color: '#00f', bot: true });
  const dummy = new Bot(2, { level: -1 });
  sim.start();
  let guarded = 0;
  for (let i = 0; i < 30 * 8; i++) {
    sim.setInput(1, { present: true });
    if (i % 10 === 0) sim.pushAction(1, { kind: 'jab', hand: 'L', speed: 4 });
    dummy.tick(sim);
    sim.step(1 / 30);
    dummy.observe(sim.drainEvents(), sim);
    if (sim.get(2)!.blocking) guarded++;
  }
  check(guarded === 0, `level -1 dummy never guards (${guarded} frames)`);
}

process.exitCode = fail ? 1 : 0;
