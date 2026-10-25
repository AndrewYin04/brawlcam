// Octagon rules (REVIEW.md 1:35 AM): no ring-outs; fighters knocked into the cage bounce off it (a 'cage' event
// for the shake); knockback distance still grows with damage taken; 1v1 KOs only by HP; Brawl KO at 0 HP with a
// 3 s respawn. Walking never leaves the cage.
import { Sim, octagonApothem, TUNING } from '../../shared/sim';
let fail = false;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fail = true; };
function duel(seed = 9) {
  const sim = new Sim({ mode: 'duel', meterStart: 100 }, seed);
  sim.addFighter({ id: 1, name: 'A', color: '#f00' });
  sim.addFighter({ id: 2, name: 'B', color: '#00f' });
  sim.start();
  for (let i = 0; i < 30 * 4; i++) { sim.setInput(1, { present: true }); sim.setInput(2, { present: true }); sim.step(1 / 30); }
  sim.drainEvents();
  return sim;
}
const A = octagonApothem(4.0) - TUNING.bodyRadius;
// Knockback distance grows with damage taken (open floor, center).
function knock(kb: number) {
  const sim = duel();
  const a = sim.get(1)!, b = sim.get(2)!;
  a.x = 0; a.z = -0.5; b.x = 0; b.z = 0.5; b.kb = kb; a.yaw = 0; b.yaw = Math.PI;
  sim.pushAction(1, { kind: 'jab', hand: 'L', speed: 4 });
  for (let i = 0; i < 30; i++) { sim.setInput(2, { present: true }); sim.step(1 / 30); }
  return b.z - 0.5;
}
const d0 = knock(0), d60 = knock(60), d120 = knock(120);
check(d60 > d0 * 1.4 && d120 > d60, `knockback grows with damage taken: ${d0.toFixed(2)} / ${d60.toFixed(2)} / ${d120.toFixed(2)} m at 0 / 60 / 120 taken`);
// Heavy hit next to the fence: slams into the cage, bounces back, stays inside, round does not end.
{
  const sim = duel();
  const a = sim.get(1)!, b = sim.get(2)!;
  b.x = 0; b.z = A - 0.4; a.x = 0; a.z = A - 1.3; b.kb = 80; a.yaw = 0; b.yaw = Math.PI;
  sim.pushAction(1, { kind: 'uppercut', hand: 'R', speed: 6 }); // super uppercut (full meter)
  let ev: any[] = [];
  let maxR = 0;
  for (let i = 0; i < 90; i++) { sim.setInput(2, { present: true }); sim.step(1 / 30); ev = ev.concat(sim.drainEvents()); maxR = Math.max(maxR, b.z); }
  const cage = ev.find((e) => e.type === 'cage' && e.id === 2);
  check(!!cage, `super uppercut into the fence: cage slam event ${JSON.stringify(cage)}`);
  check(maxR <= A + 1e-6 && b.alive, `stays inside the cage (max ${maxR.toFixed(2)} of wall ${A.toFixed(2)} m), alive ${b.alive}`);
  check(!ev.some((e) => e.type === 'ko' || e.type === 'round_end'), 'no ring-out, the round goes on');
  check(b.z < A - 0.05, `bounced back off the fence: ends ${(A - b.z).toFixed(2)} m from it`);
}
// Walking into the fence: stops at it, no slam event.
{
  const sim = duel();
  const b = sim.get(2)!;
  let ev: any[] = [];
  for (let i = 0; i < 30 * 6; i++) { sim.setInput(1, { present: true }); sim.setInput(2, { present: true, move: [1, -1] }); sim.step(1 / 30); ev = ev.concat(sim.drainEvents()); }
  const r = Math.max(...Array.from({ length: 8 }, (_, k) => { const ang = ((k + 0.5) / 8) * Math.PI * 2 + Math.PI / 8; return b.x * Math.cos(ang) + b.z * Math.sin(ang); }));
  check(r <= A + 1e-6 && r > A - 0.3, `walking backward-sideways for 6 s ends against the fence (${r.toFixed(2)} of ${A.toFixed(2)} m)`);
  check(!ev.some((e) => e.type === 'cage' || e.type === 'ko'), 'walking into the fence: no slam, no KO');
}
// 1v1: HP to zero is the KO that ends the round.
{
  const sim = duel();
  const b = sim.get(2)!;
  b.hp = 3;
  sim.get(1)!.x = 0; sim.get(1)!.z = -0.5; b.x = 0; b.z = 0.5; sim.get(1)!.yaw = 0; b.yaw = Math.PI;
  sim.pushAction(1, { kind: 'jab', hand: 'L', speed: 4 });
  let ev: any[] = [];
  for (let i = 0; i < 10; i++) { sim.step(1 / 30); ev = ev.concat(sim.drainEvents()); }
  const ko = ev.find((e) => e.type === 'ko');
  check(!!ko && ko.target === 2 && !ko.ringout && ev.some((e) => e.type === 'round_end'), `1v1 HP KO ends the round: ${JSON.stringify(ko)}`);
}
// Brawl: HP KO, respawn after 3 s with full HP, KO credited.
{
  const sim = new Sim({ mode: 'brawl' }, 5);
  for (let id = 1; id <= 3; id++) sim.addFighter({ id, name: 'F' + id, color: '#888' });
  sim.start();
  for (let i = 0; i < 30 * 4; i++) { for (let id = 1; id <= 3; id++) sim.setInput(id, { present: true }); sim.step(1 / 30); }
  sim.drainEvents();
  const a = sim.get(1)!, b = sim.get(2)!;
  a.x = 0; a.z = -0.5; b.x = 0; b.z = 0.5; a.target = 2; b.hp = 4; a.yaw = 0; b.yaw = Math.PI;
  sim.pushAction(1, { kind: 'jab', hand: 'L', speed: 4 });
  let ev: any[] = [];
  let respawnT = -1;
  const t0 = sim.t;
  for (let i = 0; i < 30 * 4; i++) { sim.step(1 / 30); for (const e of sim.drainEvents()) { ev.push(e); if (e.type === 'respawn' && e.id === 2) respawnT = sim.t - t0; } }
  const ko = ev.find((e) => e.type === 'ko' && e.target === 2);
  check(!!ko && a.kos === 1, `Brawl: 0 HP is a KO credited to the attacker (kos ${a.kos})`);
  check(respawnT > 2.9 && respawnT < 3.3 && b.alive && b.hp === TUNING.hpMax, `respawn after ${respawnT.toFixed(2)} s with ${b.hp} HP`);
}
if (fail) process.exitCode = 1;
