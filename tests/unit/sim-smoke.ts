// Bot-vs-bot smoke run of the shared simulation (not evidence of UX; checks the rules terminate sanely).
import { Sim } from '../../shared/sim';
import { Bot } from '../../shared/bot';

for (const mode of ['duel', 'brawl'] as const) {
  const sim = new Sim({ mode }, 42);
  const n = mode === 'duel' ? 2 : 8;
  const bots: Bot[] = [];
  for (let i = 0; i < n; i++) { sim.addFighter({ id: i + 1, name: 'Bot' + (i + 1), color: '#f00', bot: true }); bots.push(new Bot(i + 1, { seed: i * 31 + 5, level: 1 })); }
  sim.start();
  const counts: Record<string, number> = {};
  let steps = 0;
  while (sim.phase !== 'match_over' && steps < 30 * 60 * 15) {
    for (const b of bots) b.tick(sim);
    sim.step(1 / 30);
    const ev = sim.drainEvents();
    for (const b of bots) b.observe(ev, sim);
    for (const e of ev) counts[e.type] = (counts[e.type] ?? 0) + 1;
    steps++;
  }
  console.log(mode, 'phase', sim.phase, 'winner', sim.winner, 'round', sim.round, 'simSeconds', sim.t.toFixed(1), JSON.stringify(counts), sim.fighters.map((f) => `${f.name}:hp${f.hp}/rw${f.roundWins}/ko${f.kos}`).join(' '));
}
