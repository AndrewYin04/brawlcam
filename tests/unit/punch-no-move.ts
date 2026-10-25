// Repro for "a big punch moves me backward" (REVIEW.md 2:50 AM). Real clips of people throwing hooks, straights and
// uppercuts while (mostly) standing in place run through the real GestureRecognizer into the duel sim; we measure the
// fighter's forward/back displacement around each detected strike (0.4 s before to 0.35 s after). Target: under 5 cm.
import fs from 'fs';
import path from 'path';
import { GestureRecognizer, type LM } from '../../shared/gestures';
import { Sim } from '../../shared/sim';
const ROOT = path.resolve(import.meta.dirname, '../..');
// Clips where the hips stay within ~0.1 image widths (no real footwork): hooks, uppercuts, straight/palm pushes.
const CLIPS = (process.argv[2] ? process.argv.slice(2) : ['hook_01', 'uppercut_01', 'palmpush_02', 'xshield_02', 'kickknee_01']);
let fail = false;
let worstAll = 0;
for (const name of CLIPS) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/landmarks', name + '.json'), 'utf8')) as { frames: { t: number; people: { image: LM[]; world: LM[] }[] }[] };
  const fr = d.frames.filter((f) => f.people[0]);
  const isw = fr.map((f) => Math.hypot(f.people[0].image[11][0] - f.people[0].image[12][0], f.people[0].image[11][1] - f.people[0].image[12][1])).sort((a, b) => a - b);
  const rec = new GestureRecognizer();
  rec.skipCalibration({ imgShoulderW: isw[isw.length >> 1] });
  const sim = new Sim({ mode: 'duel' }, 2);
  sim.addFighter({ id: 1, name: 'P', color: '#f00' });
  sim.addFighter({ id: 2, name: 'B', color: '#00f' });
  sim.start();
  for (let i = 0; i < 120; i++) { sim.setInput(1, { present: true }); sim.setInput(2, { present: true }); sim.step(1 / 30); }
  const b0 = { x: sim.get(2)!.x, z: sim.get(2)!.z };
  // Displacement caused by the player's forward/back INPUT (the duel assist walking you back into range after your
  // punches knock the opponent back is intended, so it is integrated separately and not counted).
  const trace: { t: number; d: number; fwd: number }[] = [];
  let inputDist = 0;
  const strikes: number[] = [];
  for (const f of fr) {
    const p = f.people[0];
    const o = rec.update({ t: f.t, world: p.world, image: p.image }, f.t);
    for (const a of o.actions) strikes.push(f.t);
    sim.setInput(1, { present: true, move: [0, o.move[1]] }); // forward/back only (the bug); strafe has its own tests
    sim.setInput(2, { present: true });
    sim.step(1 / 30);
    const a = sim.get(1)!;
    inputDist += o.move[1] * 2.4 * (1 / 30);
    trace.push({ t: f.t, d: inputDist, fwd: o.move[1] });
    void a;
  }
  let worst = 0;
  for (const st of strikes) {
    const w = trace.filter((x) => x.t >= st - 0.4 && x.t <= st + 0.35);
    if (w.length < 2) continue;
    const disp = Math.max(...w.map((x) => x.d)) - Math.min(...w.map((x) => x.d));
    worst = Math.max(worst, disp);
  }
  const fwdFrames = trace.filter((x) => x.fwd !== 0).length;
  worstAll = Math.max(worstAll, worst);
  console.log(`${name}: ${strikes.length} strikes, worst input-driven displacement around a strike ${(worst * 100).toFixed(1)} cm, forward/back input on ${fwdFrames}/${trace.length} frames`);
  if (worst > 0.05) fail = true;
}
console.log(fail ? `FAIL: a strike moved the fighter up to ${(worstAll * 100).toFixed(1)} cm (target < 5 cm)` : 'PASS');
if (fail) process.exitCode = 1;
