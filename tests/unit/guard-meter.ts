// Guard / guard break / Iron Wall rules (planner spec 2026-10-25 1:50 AM):
// - blocked hits deal 10% damage; guard meter drains 20/s while held, extra per blocked hit (jab 10, hook 15, kick 20,
//   super uppercut 60, blast 50); refills 25/s after 0.5 s with the arms down
// - at 0 the guard breaks: dizzy 2 s (no attacks, no guard, full damage), then guard restarts at 30
// - Iron Wall (X with full meter): 2.5 s, 0 damage, no drain, counters the first attacker (10 damage + stagger), costs the meter
import { Sim, TUNING, type SimEvent } from '../../shared/sim';

const DT = 1 / 30;
let fail = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fail = true;
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

function setup(opts: { meterStart?: number; mode?: 'duel' | 'brawl'; n?: number } = {}) {
  const sim = new Sim({ mode: opts.mode ?? 'duel', meterStart: opts.meterStart ?? 0, roundSeconds: 300 }, 7);
  for (let i = 1; i <= (opts.n ?? 2); i++) sim.addFighter({ id: i, name: 'F' + i, color: '#f00' });
  sim.start();
  for (const f of sim.fighters) sim.setInput(f.id, { present: true });
  let events: SimEvent[] = [];
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step(DT);
      events.push(...sim.drainEvents());
    }
  };
  while (sim.phase !== 'fight') step();
  events = [];
  /** Put attacker `a` 1.2 m in front of target `b`, both still and facing each other. */
  const face = (a: number, b: number) => {
    const A = sim.get(a)!;
    const B = sim.get(b)!;
    A.target = b;
    B.target = a;
    A.x = 0; A.z = 0.6; B.x = 0; B.z = -0.6;
    for (const f of [A, B]) { f.vx = f.vz = f.vy = 0; f.y = 0; }
    A.yaw = Math.atan2(B.x - A.x, B.z - A.z);
    B.yaw = Math.atan2(A.x - B.x, A.z - B.z);
  };
  const take = () => { const e = events; events = []; return e; };
  return { sim, step, face, take, get: (id: number) => sim.get(id)! };
}
const secs = (s: number) => Math.round(s / DT);

// ---------- 1. drain while held ----------
{
  const { sim, step, get } = setup();
  sim.setInput(2, { blocking: true });
  step(secs(1));
  check(get(2).blocking, 'guard is up while the block gesture is held');
  check(near(get(2).guard, 80, 0.5), `drains 20/s while held: guard after 1 s = ${get(2).guard.toFixed(1)} (want 80)`);
  step(secs(1.5));
  check(near(get(2).guard, 50, 0.5), `guard after 2.5 s = ${get(2).guard.toFixed(1)} (want 50)`);
  check(sim.snapshot().f[1].gd === Math.round(get(2).guard), 'snapshot gd = rounded guard meter');
}

// ---------- 2. refill: 0.5 s delay, then 25/s ----------
{
  const { sim, step, get } = setup();
  sim.setInput(2, { blocking: true });
  step(secs(3)); // -> 40
  const at = get(2).guard;
  sim.setInput(2, { blocking: false });
  step(secs(0.45));
  check(near(get(2).guard, at, 0.01), `no refill during the first 0.5 s with arms down (${at.toFixed(1)} -> ${get(2).guard.toFixed(1)})`);
  step(secs(1.05)); // 1.5 s after release: 1 s of refill
  check(near(get(2).guard, at + 25, 1), `refills 25/s after the delay: ${at.toFixed(1)} -> ${get(2).guard.toFixed(1)} (want ~${(at + 25).toFixed(0)})`);
  step(secs(5));
  check(get(2).guard === 100, `refill caps at 100 (${get(2).guard})`);
}

// ---------- 3. held too long: break at ~5 s, dizzy 2 s, back at 30 ----------
{
  const { sim, step, take, get, face } = setup();
  sim.setInput(2, { blocking: true });
  let brokeAt = -1;
  const t0 = sim.t;
  for (let i = 0; i < secs(6) && brokeAt < 0; i++) {
    step();
    const b = take().find((e) => e.type === 'guard_break');
    if (b && b.type === 'guard_break') {
      brokeAt = sim.t - t0;
      check(b.id === 2 && b.attacker === null, `guard_break {id:2, attacker:null} when it runs dry (${JSON.stringify(b)})`);
    }
  }
  check(near(brokeAt, 5, DT * 1.5), `guard held from full breaks after ${brokeAt.toFixed(2)} s (want 5)`);
  const f = get(2);
  const snap = sim.snapshot().f[1];
  check(!f.blocking && f.guard === 0, 'broken: guard down and meter 0 while still holding the gesture');
  check(near(snap.dz, TUNING.guardBreakDizzy, 0.05), `snapshot dz = dizzy seconds left (${snap.dz})`);
  // Dizzy: cannot attack
  face(2, 1);
  sim.pushAction(2, { kind: 'jab', hand: 'L', speed: 5 });
  step();
  check(!take().some((e) => e.type === 'hit' || e.type === 'whiff'), 'dizzy fighter cannot attack');
  // Dizzy: takes normal damage even with the block gesture held
  face(1, 2);
  const hp0 = get(2).hp;
  sim.pushAction(1, { kind: 'jab', hand: 'L', speed: 6 });
  step();
  const hit = take().find((e) => e.type === 'hit');
  check(!!hit && hit.type === 'hit' && !hit.blocked && hp0 - get(2).hp === 15, `dizzy fighter takes full damage (${hp0 - get(2).hp}, want 15)`);
  // Dizzy lasts 2 s
  let endAt = -1;
  for (let i = 0; i < secs(3) && endAt < 0; i++) {
    step();
    if (get(2).dizzyUntil === 0) endAt = sim.t - t0 - brokeAt;
  }
  check(near(endAt, 2, DT * 1.5), `dizzy lasts ${endAt.toFixed(2)} s (want 2)`);
  check(near(get(2).guard, 30, 1), `guard restarts at 30 after dizzy (${get(2).guard.toFixed(1)}; still holding block, so it is draining again)`);
  check(get(2).blocking, 'guard comes back up after dizzy if the gesture is still held');
}

// ---------- 4. blocked hits: 10% damage + per-kind drain ----------
{
  const { sim, step, take, get, face } = setup();
  const cases: [string, number, number][] = [
    ['jab', 6, 10],
    ['hook', 6, 15],
    ['kick', 6, 20],
    ['uppercut', 6, 15],
  ];
  for (const [kind, speed, drain] of cases) {
    get(2).guard = 100;
    get(1).cd = {};
    face(1, 2);
    sim.setInput(2, { blocking: true });
    step();
    take();
    const g0 = get(2).guard;
    const hp0 = get(2).hp;
    sim.pushAction(1, { kind: kind as any, hand: 'L', speed });
    step();
    const h = take().find((e) => e.type === 'hit');
    if (!h || h.type !== 'hit') { check(false, `${kind}: no hit`); continue; }
    const full = kind === 'kick' ? 18 : kind === 'hook' ? 17 : kind === 'uppercut' ? 16 : 15;
    check(h.blocked && hp0 - get(2).hp === Math.round(full * 0.1), `blocked ${kind} deals 10%: ${hp0 - get(2).hp} of ${full}`);
    check(near(g0 - h.guard, drain, 0.51), `blocked ${kind} drains ${drain}: guard ${g0.toFixed(1)} -> ${h.guard} (hit event 'guard' field)`);
    check(get(2).stunUntil <= sim.t, `blocked ${kind} does not stun`);
    sim.setInput(2, { blocking: false });
    step(secs(0.6));
  }
}

// ---------- 5. super uppercut and blast vs guard ----------
{
  const { sim, step, take, get, face } = setup({ meterStart: 100 });
  face(1, 2);
  sim.setInput(2, { blocking: true });
  step();
  take();
  const g0 = get(2).guard;
  const hp0 = get(2).hp;
  sim.pushAction(1, { kind: 'uppercut', hand: 'R', speed: 5 });
  step();
  const h = take().find((e) => e.type === 'hit');
  check(!!h && h.type === 'hit' && h.kind === 'super_uppercut' && h.blocked, 'super uppercut is blocked by a guard (no longer breaks it outright)');
  check(hp0 - get(2).hp === Math.round(TUNING.superUppercutDamage * 0.1), `blocked super uppercut deals 10%: ${hp0 - get(2).hp}`);
  check(h?.type === 'hit' && near(g0 - h.guard, 60, 0.51), `blocked super uppercut drains 60: ${g0.toFixed(1)} -> ${h?.type === 'hit' ? h.guard : '?'}`);
  check(get(2).vy === 0 && get(2).y === 0, 'blocked super uppercut does not launch');
  // blast vs a guard with 40 left: drains 50 -> breaks, attacker credited
  step(secs(1));
  get(2).guard = 40;
  get(2).meter = 100;
  get(1).meter = 0;
  face(2, 1);
  sim.setInput(1, { blocking: true });
  sim.setInput(2, { blocking: false });
  step();
  get(1).guard = 40;
  take();
  sim.pushAction(2, { kind: 'palm', hand: 'B', speed: 3 });
  let hit: SimEvent | undefined;
  let brk: SimEvent | undefined;
  for (let i = 0; i < secs(1.5) && !brk; i++) {
    step();
    for (const e of take()) {
      if (e.type === 'hit') hit = e;
      if (e.type === 'guard_break') brk = e;
    }
  }
  check(hit?.type === 'hit' && hit.kind === 'blast' && hit.blocked && hit.damage === 2, `blocked blast deals 10% (${hit?.type === 'hit' ? hit.damage : '?'} of 20)`);
  check(brk?.type === 'guard_break' && brk.id === 1 && brk.attacker === 2, `blast (50) breaks a 40 guard, credited to the attacker: ${JSON.stringify(brk)}`);
}

// ---------- 6. Iron Wall ----------
{
  const { sim, step, take, get, face } = setup({ meterStart: 100 });
  get(1).meter = 0;
  face(1, 2);
  // F2 throws the X with a full meter and keeps holding it.
  sim.setInput(2, { xshield: true });
  sim.pushAction(2, { kind: 'xshield', hand: 'B', speed: 0 });
  step();
  const ev = take();
  check(ev.some((e) => e.type === 'super' && e.id === 2 && e.kind === 'ironwall'), "X with full meter fires {type:'super', kind:'ironwall'}");
  check(get(2).meter === 0, 'Iron Wall costs the full super meter');
  check(near(sim.snapshot().f[1].iw, TUNING.ironWallSeconds, 0.05), `snapshot iw = Iron Wall seconds left (${sim.snapshot().f[1].iw})`);
  // First attacker: 0 damage, countered.
  const hp2 = get(2).hp;
  const hp1 = get(1).hp;
  const g2 = get(2).guard;
  sim.pushAction(1, { kind: 'hook', hand: 'L', speed: 6 });
  step();
  const ev2 = take();
  const h = ev2.find((e) => e.type === 'hit');
  const c = ev2.find((e) => e.type === 'iron_counter');
  check(h?.type === 'hit' && h.shielded && !h.blocked && h.damage === 0 && get(2).hp === hp2, 'hit on the Iron Wall: shielded, 0 damage');
  check(get(2).guard >= g2, `Iron Wall: no guard drain (${g2.toFixed(1)} -> ${get(2).guard.toFixed(1)})`);
  check(c?.type === 'iron_counter' && c.id === 2 && c.attacker === 1 && c.damage === 10, `iron_counter {id:2, attacker:1, damage:10}: ${JSON.stringify(c)}`);
  check(hp1 - get(1).hp === TUNING.ironCounterDamage, `countered attacker takes ${hp1 - get(1).hp} damage (want 10)`);
  check(get(1).stunUntil > sim.t + 0.4, 'countered attacker is staggered');
  get(1).cd = {};
  sim.pushAction(1, { kind: 'jab', hand: 'R', speed: 6 });
  step();
  check(!take().some((e) => e.type === 'hit' || e.type === 'whiff'), 'staggered attacker cannot attack');
  // Second hit on the same wall: blocked for 0, no second counter.
  step(secs(TUNING.ironCounterStagger));
  face(1, 2);
  get(1).cd = {};
  const hp1b = get(1).hp;
  sim.pushAction(1, { kind: 'kick', hand: 'R', speed: 6 });
  step();
  const ev3 = take();
  check(ev3.some((e) => e.type === 'hit' && e.shielded && e.damage === 0) && !ev3.some((e) => e.type === 'iron_counter') && get(1).hp === hp1b, 'only the first attacker is countered; later hits still do 0');
  check(sim.snapshot().f[1].b === 0, 'normal guard flag stays off while the Iron Wall is up (no drain)');
  // Wall lasts 2.5 s
  const until = get(2).ironWallUntil;
  step(Math.ceil((until - sim.t) / DT) + 1);
  check(sim.snapshot().f[1].iw === 0, 'Iron Wall ends after 2.5 s');
  // X still held, meter now < 100: it is an ordinary guard again (drains).
  check(get(2).blocking, 'still holding the X after the wall ends = ordinary guard');
}

// ---------- 7. Iron Wall in a brawl: only the first of two attackers is countered ----------
{
  const { sim, step, take, get } = setup({ mode: 'brawl', n: 3, meterStart: 0 });
  const W = get(1);
  W.meter = 100;
  W.x = 0; W.z = 0;
  const A = get(2); A.x = 0; A.z = 1.1;
  const B = get(3); B.x = 1.1; B.z = 0;
  for (const f of [A, B]) { f.target = 1; f.vx = f.vz = 0; f.yaw = Math.atan2(-f.x, -f.z); }
  sim.pushAction(1, { kind: 'xshield', hand: 'B', speed: 0 });
  step();
  take();
  sim.pushAction(2, { kind: 'jab', hand: 'L', speed: 5 });
  sim.pushAction(3, { kind: 'jab', hand: 'L', speed: 5 });
  step();
  const counters = take().filter((e) => e.type === 'iron_counter');
  check(counters.length === 1 && counters[0].type === 'iron_counter' && counters[0].attacker === 2, `brawl: one counter, on the first attacker (${JSON.stringify(counters)})`);
}

// ---------- 8. dizzy blocks the Iron Wall too ----------
{
  const { sim, step, take, get } = setup({ meterStart: 100 });
  sim.setInput(2, { blocking: true });
  step(secs(5.2));
  check(get(2).dizzyUntil > 0, 'setup: F2 guard-broken');
  take();
  sim.setInput(2, { blocking: false, xshield: true });
  sim.pushAction(2, { kind: 'xshield', hand: 'B', speed: 0 });
  step(3);
  check(!take().some((e) => e.type === 'super') && get(2).meter === 100, 'dizzy fighter cannot fire the Iron Wall');
}

process.exitCode = fail ? 1 : 0;
