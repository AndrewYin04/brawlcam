// Check: a landed super uppercut launches the target into the air (peak height), in slow motion.
import { Sim } from '../../shared/sim';
const sim = new Sim({ mode: 'duel', meterStart: 100 }, 3);
sim.addFighter({ id: 1, name: 'A', color: '#f00' });
sim.addFighter({ id: 2, name: 'B', color: '#00f' });
sim.start();
for (let i = 0; i < 30 * 4; i++) { sim.setInput(1, { present: true }); sim.setInput(2, { present: true }); sim.step(1 / 30); }
sim.pushAction(1, { kind: 'uppercut', hand: 'R', speed: 6 });
let peak = 0, airborneFrames = 0;
for (let i = 0; i < 30 * 5; i++) { sim.step(1 / 30); const b = sim.get(2)!; peak = Math.max(peak, b.y); if (b.y > 0.05) airborneFrames++; }
const ev = sim.drainEvents().filter((e) => e.type === 'hit' || e.type === 'super');
console.log('events', JSON.stringify(ev.map((e: any) => [e.type, e.kind, e.damage])), 'peak height m', peak.toFixed(2), 'airborne real s', (airborneFrames / 30).toFixed(2));
process.exitCode = peak > 1 ? 0 : 1;
