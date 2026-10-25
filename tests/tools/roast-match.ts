// Gemini roasts written from a real match: a research session (the user's own recorded motion) drives a fighter through
// the real GestureRecognizer into the real Sim against a bot; every 5 s of match time the events are summarized
// (shared/commentary.ts, the same summary the game sends) and POSTed to the live /api/commentary (Gemini).
// Usage: npx tsx tests/tools/roast-match.ts <session-exact> [--base https://throwhands.tech] > lines.json
import fs from 'fs';
import path from 'path';
import { GestureRecognizer } from '../../shared/gestures';
import { Sim, type SimEvent } from '../../shared/sim';
import { Bot } from '../../shared/bot';
import { summarize } from '../../shared/commentary';
const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const sess = args[0];
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'https://throwhands.tech';
const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/research', sess + '.json'), 'utf8')).frames;
const rec = new GestureRecognizer();
rec.beginCalibration();
const sim = new Sim({ mode: 'duel' } as any, 7);
sim.addFighter({ id: 1, name: 'You', color: '#ff3d6e' } as any);
sim.addFighter({ id: 2, name: 'Iron Rook', color: '#3db8ff', bot: true } as any);
const bot = new Bot(2, { level: 1, seed: 5 });
sim.start();
let fi = 0;
let buf: SimEvent[] = [];
let lastAsk = 0;
const lines: { t: number; summary: string; text: string; source: string }[] = [];
const dt = 1 / 30;
const tEnd = fr[fr.length - 1].t;
let out: any = null;
for (let t = 0; t < tEnd; t += dt) {
  while (fi < fr.length && fr[fi].t <= t) {
    const p = fr[fi].people?.[0];
    out = rec.update(p ? { t: fr[fi].t, world: p.world, image: p.image } : null, fr[fi].t);
    for (const a of out.actions) sim.pushAction(1, { kind: a.kind, hand: a.hand, speed: a.speed });
    fi++;
  }
  sim.setInput(1, { present: !!out?.present, move: out?.move ?? [0, 0], blocking: !!out?.blocking, xshield: !!out?.xshield });
  bot.tick(sim);
  sim.step(dt);
  const ev = sim.drainEvents();
  bot.observe(ev, sim);
  for (const e of ev) if (e.type !== 'whiff' && e.type !== 'super_denied' && e.type !== 'respawn') buf.push(e);
  const snap = sim.snapshot(false) as any;
  if (t - lastAsk >= 5 && buf.length && (snap.phase === 'fight' || buf.some((e) => e.type === 'ko' || e.type === 'match_over'))) {
    lastAsk = t;
    const summary = summarize(buf, snap);
    buf = [];
    const r = await fetch(BASE + '/api/commentary', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary, voice: false }) }).then((x) => x.json()).catch(() => null);
    if (r?.text) lines.push({ t: +t.toFixed(1), summary, text: r.text, source: r.source });
    await new Promise((res) => setTimeout(res, 1500));
  }
}
console.log(JSON.stringify(lines, null, 1));
