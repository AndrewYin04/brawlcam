// Repro: in Brawl, a human whose movement input drifts toward the edge walks out of the ring by themselves.
import { Sim } from '../../shared/sim';
const sim = new Sim({ mode: 'brawl' }, 7);
sim.addFighter({ id: 1, name: 'Human', color: '#f00' });
sim.addFighter({ id: 2, name: 'Dummy', color: '#00f' });
sim.start();
for (let i = 0; i < 30 * 4; i++) sim.step(1 / 30); // countdown
let selfOuts = 0;
for (let i = 0; i < 30 * 20; i++) {
  // Strafing steadily (lean held) and drifting backward, as noisy webcam input can do.
  sim.setInput(1, { present: true, move: [1, -0.6] });
  sim.setInput(2, { present: true, move: [0, 0] });
  sim.step(1 / 30);
  for (const e of sim.drainEvents()) if (e.type === 'ko' && e.target === 1 && e.attacker == null) selfOuts++;
}
console.log('self ring-outs in 20 s with no hits:', selfOuts);
process.exitCode = selfOuts > 0 ? 1 : 0;
