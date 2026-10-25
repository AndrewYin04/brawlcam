// Grappling rules in the sim (planner spec 2026-10-25 2:50 AM, section B), behind SimConfig.grapple:
// - grab: 1.1 m, 0.3 s startup; a strike landing on the grabber during startup cancels it (strike beats grab); a guarding
//   target is grabbed anyway (grab beats guard); Iron Wall is immune
// - clinch: locked at 0.6 m for up to 3 s; holder's knees deal 8, hooks normal damage; held fighter escapes with a palm
//   frame or by leaning back hard (forward input < -0.6 for 0.3 s)
// - Shoulder Throw: full meter (spent), from the clinch or 1 m; 25 damage the guard cannot block; Iron Wall stops it; a
//   strike in its first 0.3 s cancels it; target lands ~1 m behind the thrower, airborne, with ~0.4 s slow motion
// - flag off: grab/throw actions do nothing and snapshots carry no grappling fields
// - bots grab guarding players, knee in the clinch and throw with a full meter
import { Sim, TUNING, damageForSpeed, type SimEvent, type SimConfig } from '../../shared/sim';
import { Bot } from '../../shared/bot';
import { summarize } from '../../shared/commentary';

const DT = 1 / 30;
let fail = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fail = true;
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const secs = (s: number) => Math.round(s / DT);

function setup(opts: { grapple?: boolean; meterStart?: number; mode?: 'duel' | 'brawl'; n?: number; gap?: number } = {}) {
  const cfg: Partial<SimConfig> & { mode: 'duel' | 'brawl' } = { mode: opts.mode ?? 'duel', meterStart: opts.meterStart ?? 0, roundSeconds: 300, grapple: opts.grapple ?? true };
  const sim = new Sim(cfg, 11);
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
  /** Put `a` `gap` m in front of `b`, both still and facing each other (duel assist idle: recent forward input). */
  const face = (a: number, b: number, gap = opts.gap ?? 1.0) => {
    const A = sim.get(a)!;
    const B = sim.get(b)!;
    A.target = b;
    B.target = a;
    A.x = 0; A.z = gap / 2; B.x = 0; B.z = -gap / 2;
    for (const f of [A, B]) { f.vx = f.vz = f.vy = 0; f.y = 0; f.lastFwdInputAt = sim.t + 99; }
    A.yaw = Math.atan2(B.x - A.x, B.z - A.z);
    B.yaw = Math.atan2(A.x - B.x, A.z - B.z);
  };
  const take = () => { const e = events; events = []; return e; };
  const dist = (a: number, b: number) => Math.hypot(sim.get(a)!.x - sim.get(b)!.x, sim.get(a)!.z - sim.get(b)!.z);
  /** Grab and run the startup out: returns events. */
  const clinch = (a = 1, b = 2) => {
    sim.pushAction(a, { kind: 'grab', hand: 'B', speed: 0 });
    step(secs(TUNING.grabStartup) + 2);
    return take();
  };
  return { sim, step, face, take, dist, clinch, get: (id: number) => sim.get(id)! };
}
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) => ev.filter((e) => e.type === type) as Extract<SimEvent, { type: T }>[];

// ---------- 0. flag off: grab / throw do nothing ----------
{
  const { sim, step, face, take, get } = setup({ grapple: false, meterStart: 100 });
  face(1, 2);
  sim.setInput(2, { blocking: true });
  const before = JSON.stringify(sim.snapshot());
  sim.pushAction(1, { kind: 'grab', hand: 'B', speed: 0 });
  sim.pushAction(1, { kind: 'throw', hand: 'B', speed: 0 });
  step(secs(1));
  const ev = take();
  check(ev.length === 0, `flag off: grab + throw produce no events (${JSON.stringify(ev)})`);
  check(get(1).meter === 100 && get(2).hp === 100 && !get(1).clinch && !get(1).grapple, 'flag off: no meter spent, no damage, no clinch');
  const snap = JSON.stringify(sim.snapshot());
  check(!/"(cl|ch|gr)":/.test(before + snap), 'flag off: snapshot has no grappling fields');
  check(new Sim({ mode: 'duel' }).cfg.grapple === false && new Sim({ mode: 'brawl' }).cfg.grapple === false, 'grapple defaults to false (duel and brawl)');
}
// Flag off: a bot match with injected grab/throw actions is identical, frame by frame, to the same match without them.
{
  const runMatch = (inject: boolean) => {
    const sim = new Sim({ mode: 'duel', meterStart: 100, roundSeconds: 40 }, 5);
    sim.addFighter({ id: 1, name: 'A', color: '#f00' });
    sim.addFighter({ id: 2, name: 'B', color: '#00f' });
    const bots = [new Bot(1, { level: 2, seed: 3 }), new Bot(2, { level: 3, seed: 4 })];
    sim.start();
    const out: string[] = [];
    for (let i = 0; i < secs(60); i++) {
      for (const b of bots) b.tick(sim);
      if (inject && i % 7 === 0) sim.pushAction(1 + (i % 2), { kind: i % 3 ? 'grab' : 'throw', hand: 'B', speed: 0 });
      sim.step(DT);
      const ev = sim.drainEvents();
      for (const b of bots) b.observe(ev, sim);
      out.push(JSON.stringify(sim.snapshot()) + JSON.stringify(ev));
    }
    return out;
  };
  const a = runMatch(false);
  const b = runMatch(true);
  const firstDiff = a.findIndex((x, i) => x !== b[i]);
  check(firstDiff === -1, `flag off: 60 s bot match identical with and without injected grab/throw actions (first diff frame ${firstDiff})`);
}

// ---------- 1. grab beats guard -> clinch ----------
{
  const { sim, step, face, take, get, dist, clinch } = setup();
  face(1, 2, 1.0);
  sim.setInput(2, { blocking: true });
  step(2);
  check(get(2).blocking, 'target is guarding');
  sim.pushAction(1, { kind: 'grab', hand: 'B', speed: 0 });
  step(1);
  let ev = take();
  check(of(ev, 'grab').length === 1 && of(ev, 'grab')[0].target === 2, 'grab event {id: 1, target: 2}');
  check(sim.snapshot().f[0].gr === 'g', `snapshot gr = 'g' during the startup`);
  check(!get(1).clinch, 'no clinch before the 0.3 s startup ends');
  step(secs(TUNING.grabStartup) + 1);
  ev = take();
  const cs = of(ev, 'clinch_start');
  check(cs.length === 1 && cs[0].holder === 1 && cs[0].held === 2, `clinch_start {holder 1, held 2} after the startup (${JSON.stringify(cs)})`);
  check(!get(2).blocking, 'held fighter\'s guard drops even though the block gesture is still held (grab beats guard)');
  step(3);
  check(near(dist(1, 2), TUNING.clinchDist, 0.01), `locked at ${TUNING.clinchDist} m (got ${dist(1, 2).toFixed(3)})`);
  const s = sim.snapshot().f;
  check(s[0].cl === 2 && s[0].ch === 1 && s[1].cl === 1 && s[1].ch === undefined && s[0].gr === undefined, `snapshot: holder cl=2 ch=1, held cl=1 (${JSON.stringify([s[0].cl, s[0].ch, s[1].cl, s[1].ch])})`);
  // Movement input does not pull them apart while locked.
  sim.setInput(1, { move: [1, -1] });
  sim.setInput(2, { move: [-1, 0.5] });
  step(secs(0.5));
  check(near(dist(1, 2), TUNING.clinchDist, 0.01) && !!get(1).clinch, `still locked at ${TUNING.clinchDist} m while both push the stick around`);
  void clinch;
}

// ---------- 2. strike beats grab ----------
{
  const { sim, step, face, take, get } = setup();
  face(1, 2, 1.0);
  sim.pushAction(1, { kind: 'grab', hand: 'B', speed: 0 });
  step(secs(0.1));
  sim.pushAction(2, { kind: 'jab', hand: 'L', speed: 4 });
  step(secs(0.5));
  const ev = take();
  const gc = of(ev, 'grab_cancel');
  check(gc.length === 1 && gc[0].id === 1 && gc[0].k === 'g' && gc[0].reason === 'hit', `a jab landing during the startup cancels the grab (${JSON.stringify(gc)})`);
  check(of(ev, 'clinch_start').length === 0 && !get(1).clinch && !get(2).clinch, 'no clinch after the cancelled grab');
}

// ---------- 3. Iron Wall is immune to grabs; grab range ----------
{
  const { sim, step, face, take, get } = setup({ meterStart: 100 });
  face(1, 2, 1.0);
  get(1).meter = 0;
  sim.pushAction(2, { kind: 'xshield', hand: 'B', speed: 0 });
  step(1);
  check(sim.t < get(2).ironWallUntil, 'target has the Iron Wall up');
  take();
  sim.pushAction(1, { kind: 'grab', hand: 'B', speed: 0 });
  step(secs(0.5));
  const ev = take();
  const gc = of(ev, 'grab_cancel');
  check(gc.length === 1 && gc[0].reason === 'iron' && !get(1).clinch, `grab on an Iron Wall fails: grab_cancel reason 'iron' (${JSON.stringify(gc)})`);
}
{
  const { sim, step, face, take, get } = setup();
  face(1, 2, 1.4);
  sim.pushAction(1, { kind: 'grab', hand: 'B', speed: 0 });
  step(secs(0.5));
  const ev = take();
  check(of(ev, 'grab').length === 0 && of(ev, 'whiff').some((e) => e.kind === 'grab') && !get(1).clinch, `grab from 1.4 m (> ${TUNING.grabRange}) whiffs`);
}
{
  // Target steps away during the startup: miss.
  const { sim, step, face, take, get } = setup();
  face(1, 2, 1.0);
  sim.pushAction(1, { kind: 'grab', hand: 'B', speed: 0 });
  step(1);
  get(2).z -= 0.8;
  step(secs(0.4));
  const gc = of(take(), 'grab_cancel');
  check(gc.length === 1 && gc[0].reason === 'miss' && !get(1).clinch, `target escaping range during the startup -> grab_cancel 'miss'`);
}

// ---------- 4. clinch offense: knees 8, hooks normal, jabs smothered; held fighter can't strike or guard ----------
{
  const { sim, step, face, take, get, clinch } = setup();
  face(1, 2, 1.0);
  clinch();
  sim.setInput(2, { blocking: true });
  sim.pushAction(1, { kind: 'kick', hand: 'R', speed: 3 });
  step(1);
  let ev = take();
  let hits = of(ev, 'hit');
  check(hits.length === 1 && hits[0].kind === 'knee' && hits[0].damage === TUNING.kneeDamage && !hits[0].blocked, `holder's knee: ${TUNING.kneeDamage} damage, not blocked by the held fighter's guard (${JSON.stringify(hits.map((h) => [h.kind, h.damage, h.blocked]))})`);
  check(get(2).hp === 100 - TUNING.kneeDamage, `held hp ${get(2).hp}`);
  step(secs(0.7));
  sim.pushAction(1, { kind: 'hook', hand: 'L', speed: 4 });
  step(1);
  hits = of(take(), 'hit');
  const want = Math.round(damageForSpeed(4) * 1.1);
  check(hits.length === 1 && hits[0].kind === 'hook' && hits[0].damage === want, `holder's hook: normal damage ${want} (got ${hits[0]?.damage})`);
  step(secs(0.4));
  sim.pushAction(1, { kind: 'jab', hand: 'R', speed: 4 });
  sim.pushAction(2, { kind: 'hook', hand: 'R', speed: 4 });
  sim.pushAction(2, { kind: 'jab', hand: 'L', speed: 4 });
  step(2);
  ev = take();
  check(of(ev, 'hit').length === 0 && of(ev, 'whiff').length === 0, 'in the clinch the holder\'s jab and the held fighter\'s strikes do nothing');
  check(!!get(1).clinch, 'still clinched');
}

// ---------- 5. escapes: palm frame, lean back hard, timeout ----------
{
  const { sim, step, face, take, get, dist, clinch } = setup({ meterStart: 100 });
  face(1, 2, 1.0);
  clinch();
  sim.pushAction(2, { kind: 'palm', hand: 'B', speed: 3 });
  step(1);
  const ev = take();
  const ce = of(ev, 'clinch_end');
  check(ce.length === 1 && ce[0].reason === 'escape' && ce[0].holder === 1 && ce[0].held === 2, `held fighter's palm frame escapes (${JSON.stringify(ce)})`);
  check(of(ev, 'super').length === 0 && sim.projectiles.length === 0 && get(2).meter === 100, 'the frame does not fire the energy blast (meter kept)');
  step(secs(0.5));
  check(dist(1, 2) > TUNING.minDist - 0.01 && !get(1).clinch && !get(2).clinch, `released and pushed apart (${dist(1, 2).toFixed(2)} m)`);
  check(sim.snapshot().f.every((f) => f.cl === undefined && f.ch === undefined), 'snapshot cl/ch cleared');
}
{
  const { sim, step, face, take, get, clinch } = setup();
  face(1, 2, 1.0);
  clinch();
  sim.setInput(2, { move: [0, -0.5] });
  step(secs(1));
  check(!!get(2).clinch && of(take(), 'clinch_end').length === 0, 'leaning back gently (forward -0.5) for 1 s does not escape');
  sim.setInput(2, { move: [0, -0.8] });
  step(secs(0.2));
  check(!!get(2).clinch, 'leaning back hard for 0.2 s: still held');
  step(secs(0.15));
  const ce = of(take(), 'clinch_end');
  check(ce.length === 1 && ce[0].reason === 'escape' && !get(2).clinch, `leaning back hard (forward -0.8) for 0.3 s escapes (${JSON.stringify(ce)})`);
}
{
  const { sim, step, face, take, get, clinch } = setup();
  face(1, 2, 1.0);
  const t0 = sim.t;
  clinch();
  step(secs(TUNING.clinchSeconds - 0.5));
  check(!!get(1).clinch, 'still clinched before 3 s');
  let ended = -1;
  for (let i = 0; i < secs(1.5) && ended < 0; i++) {
    step();
    if (of(take(), 'clinch_end').some((e) => e.reason === 'timeout')) ended = sim.t;
  }
  check(ended > 0 && near(ended - t0, TUNING.grabStartup + TUNING.clinchSeconds, 0.1), `clinch breaks on its own after ${TUNING.clinchSeconds} s (at ${(ended - t0).toFixed(2)} s after the grab, startup ${TUNING.grabStartup})`);
  void sim;
}

// ---------- 6. Shoulder Throw ----------
{
  // From the clinch: 25 damage, full meter spent, target lands ~1 m behind the thrower, airborne, slow motion.
  const { sim, step, face, take, get, clinch } = setup();
  face(1, 2, 1.0);
  clinch();
  get(1).meter = 100;
  const A = get(1);
  sim.pushAction(1, { kind: 'throw', hand: 'B', speed: 0 });
  step(1);
  let ev = take();
  check(of(ev, 'super').some((e) => e.kind === 'throw' && e.id === 1) && get(1).meter === 0, 'throw starts: super {kind: throw}, meter spent');
  check(sim.snapshot().f[0].gr === 't', `snapshot gr = 't' during the throw startup`);
  const fx = Math.sin(A.yaw);
  const fz = Math.cos(A.yaw);
  let landed: Extract<SimEvent, { type: 'throw' }> | undefined;
  let hit: Extract<SimEvent, { type: 'hit' }> | undefined;
  let peak = 0;
  let slow = false;
  let ax = 0;
  let az = 0;
  for (let i = 0; i < secs(1.5); i++) {
    step();
    ev = take();
    landed ??= of(ev, 'throw')[0];
    hit ??= of(ev, 'hit')[0];
    if (landed && !ax) { ax = A.x; az = A.z; }
    if (landed) { peak = Math.max(peak, get(2).y); slow ||= sim.snapshot().slow === 1; }
    if (of(ev, 'clinch_end').length) check(of(ev, 'clinch_end')[0].reason === 'throw', 'clinch_end reason throw');
  }
  check(!!landed && landed.damage === TUNING.throwDamage && landed.id === 1 && landed.target === 2, `throw event: 25 damage (${JSON.stringify(landed)})`);
  check(!!hit && hit.kind === 'throw' && hit.damage === 25 && !hit.blocked && hit.isSuper, 'hit {kind: throw, damage 25, not blocked}');
  check(get(2).hp === 75, `target hp 100 -> ${get(2).hp}`);
  if (landed) {
    const behind = (landed.x - ax) * fx + (landed.z - az) * fz;
    check(near(behind, -TUNING.throwLand, 0.15), `target lands ${(-behind).toFixed(2)} m behind the thrower along its facing (want ${TUNING.throwLand})`);
  }
  check(peak > 0.3, `target is airborne (peak ${peak.toFixed(2)} m)`);
  check(slow, 'slow motion while the throw lands');
  check(!get(1).clinch && !get(2).clinch, 'clinch over');
}
{
  // From 0.9 m, no clinch, target guarding: the guard cannot block it.
  const { sim, step, face, take, get } = setup({ meterStart: 100 });
  face(1, 2, 0.9);
  sim.setInput(2, { blocking: true });
  step(2);
  check(get(2).blocking, 'target guarding');
  take();
  sim.pushAction(1, { kind: 'throw', hand: 'B', speed: 0 });
  step(secs(0.5));
  const hits = of(take(), 'hit');
  check(hits.length === 1 && hits[0].damage === 25 && !hits[0].blocked, `throw vs guard: 25 damage, not blocked (${JSON.stringify(hits.map((h) => [h.damage, h.blocked]))})`);
}
{
  // Needs the full meter.
  const { sim, step, face, take, get, clinch } = setup();
  face(1, 2, 1.0);
  clinch();
  get(1).meter = 99;
  sim.pushAction(1, { kind: 'throw', hand: 'B', speed: 0 });
  step(secs(0.5));
  const ev = take();
  check(of(ev, 'super_denied').some((e) => e.kind === 'throw' && e.reason === 'meter') && of(ev, 'hit').length === 0 && get(2).hp === 100 && get(1).meter === 99, 'throw with 99 meter: super_denied, no damage, meter kept');
}
{
  // Out of range (1.4 m, no clinch): whiff, meter kept.
  const { sim, step, face, take, get } = setup({ meterStart: 100 });
  face(1, 2, 1.4);
  sim.pushAction(1, { kind: 'throw', hand: 'B', speed: 0 });
  step(secs(0.5));
  const ev = take();
  check(of(ev, 'whiff').some((e) => e.kind === 'throw') && get(1).meter === 100 && get(2).hp === 100, `throw from 1.4 m (> ${TUNING.throwRange}) whiffs, meter kept`);
}
{
  // A strike in the first 0.3 s cancels it (the meter stays spent).
  const { sim, step, face, take, get } = setup({ meterStart: 100 });
  face(1, 2, 0.9);
  get(2).meter = 0;
  sim.pushAction(1, { kind: 'throw', hand: 'B', speed: 0 });
  step(secs(0.15));
  sim.pushAction(2, { kind: 'jab', hand: 'L', speed: 4 });
  step(secs(0.5));
  const ev = take();
  const gc = of(ev, 'grab_cancel');
  check(gc.length === 1 && gc[0].k === 't' && gc[0].reason === 'hit', `jab during the throw startup cancels it (${JSON.stringify(gc)})`);
  check(of(ev, 'throw').length === 0 && get(2).hp === 100 && get(1).meter < 100, 'no throw damage; meter was spent');
}
{
  // Iron Wall stops it (0 damage; the wall counters the thrower).
  const { sim, step, face, take, get } = setup({ meterStart: 100 });
  face(1, 2, 0.9);
  sim.pushAction(2, { kind: 'xshield', hand: 'B', speed: 0 });
  step(1);
  take();
  sim.pushAction(1, { kind: 'throw', hand: 'B', speed: 0 });
  step(secs(0.5));
  const ev = take();
  const hits = of(ev, 'hit');
  check(hits.length === 1 && hits[0].shielded && hits[0].damage === 0 && get(2).hp === 100 && of(ev, 'throw').length === 0, `throw vs Iron Wall: 0 damage, shielded, no throw event (${JSON.stringify(hits.map((h) => [h.damage, h.shielded]))})`);
  check(of(ev, 'iron_counter').length === 1 && get(1).meter < 100, 'the Iron Wall counters the thrower; the meter is spent');
}
{
  // Grab then throw inside the startup: the throw replaces the grab.
  const { sim, step, face, take, get } = setup({ meterStart: 100 });
  face(1, 2, 1.0);
  sim.pushAction(1, { kind: 'grab', hand: 'B', speed: 0 });
  step(secs(0.1));
  sim.pushAction(1, { kind: 'throw', hand: 'B', speed: 0 });
  step(secs(0.6));
  const ev = take();
  check(of(ev, 'throw').length === 1 && get(2).hp === 75, 'throw during the own grab startup replaces it and lands');
}

// ---------- 7. a third fighter's hit breaks the clinch; KO in the clinch ----------
{
  const { sim, step, face, take, get, clinch } = setup({ mode: 'brawl', n: 3 });
  face(1, 2, 1.0);
  get(3).x = 0; get(3).z = -1.5; get(3).target = 2; get(3).yaw = 0; get(3).lastFwdInputAt = sim.t + 99;
  for (const f of sim.fighters) f.invulnUntil = 0;
  clinch();
  check(!!get(1).clinch, 'brawl: clinched');
  get(3).x = get(2).x; get(3).z = get(2).z - 0.9; get(3).yaw = 0; get(3).target = 2;
  sim.pushAction(3, { kind: 'jab', hand: 'L', speed: 4 });
  step(1);
  const ce = of(take(), 'clinch_end');
  check(ce.length === 1 && ce[0].reason === 'hit', `a third fighter's hit breaks the clinch: reason 'hit' (${JSON.stringify(ce)})`);
}
{
  const { sim, step, face, take, get, clinch } = setup();
  face(1, 2, 1.0);
  clinch();
  get(2).hp = 5;
  sim.pushAction(1, { kind: 'kick', hand: 'R', speed: 3 });
  step(1);
  const ev = take();
  check(of(ev, 'ko').length === 1 && of(ev, 'clinch_end').some((e) => e.reason === 'hit') && !get(1).clinch, 'KO by a knee ends the clinch (reason hit)');
}

// ---------- 8. bots use the triangle (grapple on), never grapple when off ----------
{
  const run = (grapple: boolean) => {
    const sim = new Sim({ mode: 'duel', meterStart: 0, roundSeconds: 300, grapple }, 9);
    sim.addFighter({ id: 1, name: 'P', color: '#f00' });
    sim.addFighter({ id: 2, name: 'Bot', color: '#00f', bot: true });
    const bot = new Bot(2, { level: 2, seed: 77 });
    sim.start();
    const counts: Record<string, number> = {};
    for (let i = 0; i < secs(150) && sim.phase !== 'match_over'; i++) {
      // A turtling player: guards 3.5 s of every 4.5 s (drops it to refill), jabs now and then, otherwise stands still.
      const cyc = sim.t % 4.5;
      sim.setInput(1, { present: true, blocking: cyc < 3.5, move: [0, 0] });
      if (i % 45 === 0 && cyc >= 3.5) sim.pushAction(1, { kind: 'jab', hand: 'L', speed: 3 });
      // Keep the bot topped up sometimes so it gets full-meter decisions too.
      if (i % secs(20) === 0) sim.get(2)!.meter = 100;
      bot.tick(sim);
      sim.step(DT);
      const ev = sim.drainEvents();
      bot.observe(ev, sim);
      for (const e of ev) {
        const k = e.type === 'hit' ? `hit:${e.kind}` : e.type === 'clinch_end' ? `clinch_end:${e.reason}` : e.type;
        if (e.type === 'hit' && e.attacker !== 2) continue;
        counts[k] = (counts[k] ?? 0) + 1;
      }
      if (sim.phase === 'round_end') for (const f of sim.fighters) f.hp = 100;
    }
    return counts;
  };
  const on = run(true);
  const off = run(false);
  console.log('     bot vs turtling player, grapple on :', JSON.stringify(on));
  console.log('     bot vs turtling player, grapple off:', JSON.stringify(off));
  check((on.grab ?? 0) >= 3 && (on.clinch_start ?? 0) >= 2, `bot grabs the guarding player (grab ${on.grab ?? 0}, clinch_start ${on.clinch_start ?? 0})`);
  check((on['hit:knee'] ?? 0) >= 2, `bot knees in the clinch (${on['hit:knee'] ?? 0})`);
  check((on.throw ?? 0) >= 1, `bot throws with a full meter (${on.throw ?? 0})`);
  check(!off.grab && !off.clinch_start && !off.throw && !off['hit:knee'], 'grapple off: the bot never grapples');
  // Determinism: same seeds, same result.
  check(JSON.stringify(run(true)) === JSON.stringify(on), 'bot grappling is deterministic for a given seed');
}

{
  // A bot that is held tries to escape (palm frame or hard lean back).
  const sim = new Sim({ mode: 'duel', meterStart: 0, roundSeconds: 300, grapple: true }, 21);
  sim.addFighter({ id: 1, name: 'P', color: '#f00' });
  sim.addFighter({ id: 2, name: 'Bot', color: '#00f', bot: true });
  const bot = new Bot(2, { level: 1, seed: 5 });
  sim.start();
  const ends: Record<string, number> = {};
  for (let i = 0; i < secs(90); i++) {
    sim.setInput(1, { present: true, move: [0, 0.6] }); // walk in
    if (i % 15 === 0) sim.pushAction(1, { kind: 'grab', hand: 'B', speed: 0 });
    sim.get(1)!.hp = sim.get(2)!.hp = 100;
    bot.tick(sim);
    sim.step(DT);
    const ev = sim.drainEvents();
    bot.observe(ev, sim);
    for (const e of ev) if (e.type === 'clinch_end') ends[e.reason] = (ends[e.reason] ?? 0) + 1;
  }
  console.log('     player grabs a level-1 bot for 90 s, clinch endings:', JSON.stringify(ends));
  check((ends.escape ?? 0) >= 3, `held bot escapes (${ends.escape ?? 0} escapes, ${ends.timeout ?? 0} timeouts)`);
}

{
  // Commentary summary covers the new events.
  const { sim, step, face, take, get, clinch } = setup();
  face(1, 2, 1.0);
  const ev = clinch();
  sim.pushAction(1, { kind: 'kick', hand: 'R', speed: 3 });
  step(secs(0.7));
  get(1).meter = 100;
  sim.pushAction(1, { kind: 'throw', hand: 'B', speed: 0 });
  step(secs(1));
  ev.push(...take());
  const text = summarize(ev, sim.snapshot(false));
  console.log('     commentary:', text);
  check(/reaches to grab/.test(text) && /locked in the clinch/.test(text) && /SHOULDER THROW/.test(text) && /knee/.test(text) && /Shoulder Throw/.test(text), 'summarize() describes grab, clinch, knee and Shoulder Throw');
}

console.log(fail ? 'FAIL' : 'PASS');
if (fail) process.exitCode = 1;
