// Repro for "idk how to move forward and backward" (user's webcam test, REVIEW.md 1:35 AM).
// Real guard landmarks (clips/landmarks/guard_02.json) are transformed to simulate the player
// 1) leaning their upper body ~12 cm toward the camera (a laptop player can't step forward), and
// 2) stepping back from the camera, then returning to their spot.
// They run through the real GestureRecognizer into the real duel sim. Prints the distance to the opponent.
import fs from 'fs';
import path from 'path';
import { GestureRecognizer, type LM } from '../../shared/gestures';
import { Sim } from '../../shared/sim';

const ROOT = path.resolve(import.meta.dirname, '../..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/landmarks/guard_02.json'), 'utf8')) as { frames: { t: number; people: { image: LM[]; world: LM[] }[] }[] };
const frames = data.frames.filter((f) => f.people[0]);
const UPPER = new Set(Array.from({ length: 23 }, (_, i) => i)); // head, shoulders, arms, hands

// pose(t) -> how to transform the frame at time t: lean (m toward camera) and scale (whole-body image scale).
type Shape = (t: number) => { lean: number; scale: number };
export function transform(p: { image: LM[]; world: LM[] }, lean: number, scale: number) {
  const hipX = (p.image[23][0] + p.image[24][0]) / 2, hipY = (p.image[23][1] + p.image[24][1]) / 2;
  // Leaning in makes the upper body larger in the image (about 1 + lean / 1.5 m camera distance).
  const up = 1 + lean / 1.5;
  const image = p.image.map((l, i) => {
    let x = l[0], y = l[1];
    if (UPPER.has(i)) { x = hipX + (x - hipX) * up; y = hipY + (y - hipY) * up; }
    x = 0.5 + (x - 0.5) * scale; y = 0.5 + (y - 0.5) * scale;
    return [x, y, l[2], l[3]] as LM;
  });
  // Lean hinges at the hips: points move toward the camera in proportion to their height above the hips.
  const world = p.world.map((l, i) => {
    if (!UPPER.has(i)) return l;
    const h = Math.max(0, -l[1]) / 0.5; // MediaPipe world: hips at the origin, y down; shoulders about 0.5 m up
    return [l[0], l[1], l[2] - lean * h, l[3]] as LM;
  });
  return { image, world };
}

export function run(shape: Shape, seconds: number) {
  const rec = new GestureRecognizer();
  // Calibrate on the untouched clip, like the guard hold at the start of a match.
  const isw = frames.map((f) => Math.hypot(f.people[0].image[11][0] - f.people[0].image[12][0], f.people[0].image[11][1] - f.people[0].image[12][1])).sort((a, b) => a - b);
  rec.skipCalibration({ shoulderW: 0.34, armLen: 0.55, imgShoulderW: isw[isw.length >> 1] });
  const sim = new Sim({ mode: 'duel' }, 3);
  sim.addFighter({ id: 1, name: 'You', color: '#f00' });
  sim.addFighter({ id: 2, name: 'Bot', color: '#00f' });
  sim.start();
  for (let i = 0; i < 30 * 4; i++) { sim.setInput(1, { present: true }); sim.setInput(2, { present: true }); sim.step(1 / 30); }
  // My distance from where the opponent stood at the start (the opponent's own assist may walk them in; that's theirs).
  const b0 = { x: sim.get(2)!.x, z: sim.get(2)!.z };
  const dist = () => { const a = sim.get(1)!; return Math.hypot(a.x - b0.x, a.z - b0.z); };
  const trace: { t: number; d: number; fwd: number }[] = [];
  for (let i = 0; i < seconds * 30; i++) {
    const t = i / 30;
    const f = frames[i % frames.length];
    const { lean, scale } = shape(t);
    const p = transform(f.people[0], lean, scale);
    const out = rec.update({ t: 100 + t, world: p.world, image: p.image }, 100 + t);
    sim.setInput(1, { present: true, move: out.move, blocking: out.blocking });
    sim.setInput(2, { present: true });
    sim.step(1 / 30);
    trace.push({ t, d: dist(), fwd: out.move[1] });
  }
  return trace;
}

const at = (tr: { t: number; d: number }[], t: number) => tr[Math.min(tr.length - 1, Math.round(t * 30))];
let fail = false;
// 1) Lean in 12 cm from 1.0 s to 2.5 s.
{
  const tr = run((t) => ({ lean: t >= 1 && t < 2.5 ? 0.12 : 0, scale: 1 }), 3);
  const d0 = at(tr, 0.9).d, d1 = at(tr, 2.4).d;
  const maxFwd = Math.max(...tr.map((x) => x.fwd));
  console.log(`(distances: from my position to the opponent's starting spot)\nlean in 12 cm: distance ${d0.toFixed(2)} -> ${d1.toFixed(2)} m (max forward input ${maxFwd.toFixed(2)})`);
  if (!(d1 < d0 - 0.25)) { console.log('  FAIL: leaning toward the camera did not advance'); fail = true; }
}
// 2) Step back (body 15% smaller in the image) from 1.0 s to 2.0 s, then return to the spot until 3.5 s.
{
  const tr = run((t) => ({ lean: 0, scale: t >= 1 && t < 2 ? 0.85 : 1 }), 3.5);
  const d0 = at(tr, 0.9).d, d1 = at(tr, 1.95).d, d2 = at(tr, 3.4).d;
  console.log(`step back then return: distance ${d0.toFixed(2)} -> ${d1.toFixed(2)} (stepped back) -> ${d2.toFixed(2)} m (1.4 s after returning)`);
  if (!(d1 > d0 + 0.5)) { console.log('  FAIL: stepping back did not retreat'); fail = true; }
  if (!(d2 > d1 - 0.05)) { console.log('  FAIL: the retreat was undone as soon as the player returned to their spot'); fail = true; }
}
// 3) Standing still in guard: no movement drift.
{
  const tr = run(() => ({ lean: 0, scale: 1 }), 3);
  const moved = Math.abs(at(tr, 2.9).d - at(tr, 0.2).d);
  const anyFwd = tr.filter((x) => x.fwd !== 0).length;
  console.log(`standing in guard: distance change ${moved.toFixed(2)} m, frames with forward/back input ${anyFwd}/${tr.length}`);
  if (anyFwd > tr.length * 0.05) { console.log('  FAIL: guard stance triggers forward/back'); fail = true; }
}
// 4) Info only: shadowboxing clips. These boxers use real footwork (they step toward and away from the camera),
// so forward/back input here is mostly correct; printed to track the rate, not asserted.
for (const name of ['jab_01', 'hook_01', 'uppercut_01', 'block_01', 'guard_01']) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/landmarks', name + '.json'), 'utf8')) as typeof data;
  const fr = d.frames.filter((f) => f.people[0]);
  const rec = new GestureRecognizer();
  const isw = fr.map((f) => Math.hypot(f.people[0].image[11][0] - f.people[0].image[12][0], f.people[0].image[11][1] - f.people[0].image[12][1])).sort((a, b) => a - b);
  rec.skipCalibration({ imgShoulderW: isw[isw.length >> 1] });
  let n = 0, mv = 0;
  for (const f of fr) { const o = rec.update({ t: f.t, world: f.people[0].world, image: f.people[0].image }, f.t); n++; if (o.move[1] !== 0) mv++; }
  console.log(`${name}: forward/back input on ${mv}/${n} frames (${((mv / n) * 100).toFixed(1)}%)`);
}
if (fail) process.exitCode = 1;
