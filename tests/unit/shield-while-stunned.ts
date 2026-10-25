// Repro: a full-meter X (Iron Wall super) must work even if the player was just hit (stunned) when the X started.
import { Sim } from '../../shared/sim';
const sim = new Sim({ mode: 'duel', meterStart: 100 }, 5);
sim.addFighter({ id: 1, name: 'P', color: '#f00' });
sim.addFighter({ id: 2, name: 'B', color: '#00f' });
sim.start();
for (let i = 0; i < 30 * 4; i++) { sim.setInput(1, { present: true }); sim.setInput(2, { present: true }); sim.step(1 / 30); }
sim.pushAction(2, { kind: 'jab', hand: 'L', speed: 5 }); // bot hits the player
sim.step(1 / 30);
sim.drainEvents();
// Player starts holding the X while stunned (onset action + held state).
sim.setInput(1, { present: true, xshield: true });
sim.pushAction(1, { kind: 'xshield', hand: 'B', speed: 0 });
for (let i = 0; i < 30; i++) sim.step(1 / 30); // keeps holding for 1 s
const shields = sim.drainEvents().filter((e) => e.type === 'super' && e.kind === 'ironwall').length;
console.log('Iron Walls fired while holding X after a hit:', shields);
process.exitCode = shields === 1 ? 0 : 1;
