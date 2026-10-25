// 1v1 ring-outs: knockback grows with damage taken; a heavy hit near the edge rings out and ends the round;
// a light hit at the edge does not; walking never takes you off.
import { Sim } from '../../shared/sim';
function setup(kb: number, xNearEdge: number | null) {
  const sim = new Sim({ mode: 'duel', meterStart: 100 }, 9);
  sim.addFighter({ id: 1, name: 'A', color: '#f00' });
  sim.addFighter({ id: 2, name: 'B', color: '#00f' });
  sim.start();
  for (let i = 0; i < 30 * 4; i++) { sim.setInput(1, { present: true }); sim.setInput(2, { present: true }); sim.step(1 / 30); }
  const a = sim.get(1)!, b = sim.get(2)!;
  b.kb = kb;
  if (xNearEdge != null) { b.x = 0; b.z = -xNearEdge; a.x = 0; a.z = -xNearEdge + 1.2; }
  sim.drainEvents();
  return { sim, a, b };
}
function knockDistance(kb: number) {
  const { sim, b } = setup(kb, null);
  const z0 = b.z;
  sim.pushAction(1, { kind: 'jab', hand: 'L', speed: 4 });
  for (let i = 0; i < 30; i++) { sim.setInput(2, { present: true, move: [0, 0] }); sim.step(1 / 30); }
  return Math.abs(b.z - z0);
}
const d0 = knockDistance(0), d60 = knockDistance(60), d120 = knockDistance(120);
console.log('jab knockback distance (m) at 0/60/120 damage taken:', d0.toFixed(2), d60.toFixed(2), d120.toFixed(2));
// Light hit at the edge: survives.
{
  const { sim, b } = setup(0, 2.9);
  sim.pushAction(1, { kind: 'jab', hand: 'L', speed: 2 });
  for (let i = 0; i < 45; i++) sim.step(1 / 30);
  console.log('light hit at edge: alive', b.alive, 'r', Math.hypot(b.x, b.z).toFixed(2));
  if (!b.alive) process.exitCode = 1;
}
// Super uppercut at the edge with damage taken: ring-out ends the round.
{
  const { sim } = setup(80, 2.6);
  sim.pushAction(1, { kind: 'uppercut', hand: 'R', speed: 6 });
  let ev: any[] = [];
  for (let i = 0; i < 90; i++) { sim.step(1 / 30); ev = ev.concat(sim.drainEvents()); }
  const ko = ev.find((e) => e.type === 'ko'), re = ev.find((e) => e.type === 'round_end');
  console.log('super uppercut at edge: ko', JSON.stringify(ko), 'round_end', JSON.stringify(re));
  if (!ko?.ringout || re?.winner !== 1) process.exitCode = 1;
}
if (!(d60 > d0 * 1.5 && d120 > d60)) process.exitCode = 1;
