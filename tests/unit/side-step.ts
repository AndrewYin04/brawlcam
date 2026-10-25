// Step sideways to strafe (REVIEW.md 2:00 AM). Real guard landmarks translated across the image simulate the
// player stepping left/right; a real shadowboxing clip with side-to-side footwork checks real footage.
import fs from 'fs';
import path from 'path';
import { GestureRecognizer, type LM } from '../../shared/gestures';
import { Sim } from '../../shared/sim';

const ROOT = path.resolve(import.meta.dirname, '../..');
type Clip = { frames: { t: number; people: { image: LM[]; world: LM[] }[] }[] };
const load = (n: string) => (JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/landmarks', n + '.json'), 'utf8')) as Clip).frames.filter((f) => f.people[0]);
const guard = load('guard_02');
const shift = (im: LM[], dx: number) => im.map((l) => [l[0] + dx, l[1], l[2], l[3]] as LM);
const isw = (im: LM[]) => Math.hypot(im[11][0] - im[12][0], im[11][1] - im[12][1]);
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
const ISW = med(guard.map((f) => isw(f.people[0].image)));
const HIPX = med(guard.map((f) => (f.people[0].image[23][0] + f.people[0].image[24][0]) / 2));

/** Strafe output after holding a sideways offset dx (raw image units) for 1 s. */
function strafeAt(dx: number, calHipX = HIPX) {
  const rec = new GestureRecognizer();
  rec.skipCalibration({ imgShoulderW: ISW, imgHipX: calHipX, leanZ: 0 });
  let out = rec.update(null, 0);
  for (let i = 0; i < 30; i++) {
    const f = guard[i % guard.length].people[0];
    out = rec.update({ t: 50 + i / 30, world: f.world, image: shift(f.image, dx) }, 50 + i / 30);
  }
  return out;
}

let fail = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) fail = true;
};
console.log(`calibrated shoulder width in image ${ISW.toFixed(3)}, hip x ${HIPX.toFixed(3)}; dead zone 0.3 sw, full 0.9 sw`);
const s0 = strafeAt(0).move[0];
check(s0 === 0, `neutral at the calibrated spot: strafe ${s0.toFixed(2)}`);
const sDead = strafeAt(ISW * 0.2).move[0];
check(sDead === 0, `inside the dead zone (0.2 shoulder widths): strafe ${sDead.toFixed(2)}`);
// Raw image +x = the player's own left.
const sL = strafeAt(ISW * 0.9).move[0];
const sR = strafeAt(-ISW * 0.9).move[0];
check(sL > 0.8, `step to own left (0.9 sw): strafe ${sL.toFixed(2)} (+ = fighter's own left)`);
check(sR < -0.8, `step to own right: strafe ${sR.toFixed(2)}`);
const sHalf = strafeAt(ISW * 0.6).move[0];
check(sHalf > 0.2 && sHalf < 0.8, `half step (0.6 sw): partial strafe ${sHalf.toFixed(2)}`);
// Edge: hips within 10% of the frame edge -> warning, and the strafe stops growing that way.
// (calibrated spot at 80% of the width, so the strafe is not already at full speed)
const nearEdge = strafeAt(0.86 - HIPX, 0.8);
const pastEdge = strafeAt(0.97 - HIPX, 0.8);
check(pastEdge.edge === 'left' && nearEdge.edge == null, `edge warning past 90% of the width: at 86% ${nearEdge.edge ?? 'none'}, at 97% ${pastEdge.edge}`);
check(pastEdge.move[0] <= strafeAt(0.9 - HIPX, 0.8).move[0] + 0.05 && pastEdge.move[0] < 1, `strafe stops growing at the edge: ${nearEdge.move[0].toFixed(2)} at 86%, ${pastEdge.move[0].toFixed(2)} at 97%`);

// Mirroring: strafe +1 must move the fighter toward its own left, which is screen-left for the camera behind it.
{
  const sim = new Sim({ mode: 'duel' }, 1);
  sim.addFighter({ id: 1, name: 'A', color: '#f00' });
  sim.addFighter({ id: 2, name: 'B', color: '#00f' });
  sim.start();
  for (let i = 0; i < 120; i++) { sim.setInput(1, { present: true }); sim.setInput(2, { present: true }); sim.step(1 / 30); }
  const a = sim.get(1)!, b = sim.get(2)!;
  const fx = (b.x - a.x), fz = (b.z - a.z), n = Math.hypot(fx, fz);
  const x0 = a.x, z0 = a.z;
  for (let i = 0; i < 15; i++) { sim.setInput(1, { present: true, move: [1, 0] }); sim.setInput(2, { present: true }); sim.step(1 / 30); }
  // Camera behind the fighter looks along f; its screen-right vector is f x up = (-fz, 0, fx).
  const screenX = ((a.x - x0) * -fz + (a.z - z0) * fx) / n;
  check(screenX < -0.1, `strafe +1 (player stepped to their own left) moves the fighter screen-left: screen dx ${screenX.toFixed(2)} m`);
}

// Real footage: a boxer moving side to side (shadow_fighterD). Strafe should follow the hips' displacement.
{
  const fr = load('shadow_fighterD');
  const rec = new GestureRecognizer();
  const cal = fr.slice(0, 15);
  rec.skipCalibration({ imgShoulderW: med(fr.map((f) => isw(f.people[0].image))), imgHipX: med(cal.map((f) => (f.people[0].image[23][0] + f.people[0].image[24][0]) / 2)) });
  const calX = rec.calib.imgHipX!, sw = rec.calib.imgShoulderW;
  let should = 0, right = 0, wrong = 0;
  for (const f of fr) {
    const p = f.people[0];
    const o = rec.update({ t: f.t, world: p.world, image: p.image }, f.t);
    const dx = ((p.image[23][0] + p.image[24][0]) / 2 - calX) / sw;
    if (Math.abs(dx) > 0.5 && o.move[0] !== 0) { should++; if (Math.sign(o.move[0]) === Math.sign(dx)) right++; else wrong++; }
    else if (Math.abs(dx) > 0.5) should++;
  }
  console.log(`shadow_fighterD (real side-to-side footwork): strafe in the stepped direction on ${right}/${should} frames stepped > 0.5 shoulder widths off the spot (${((right / Math.max(1, should)) * 100).toFixed(0)}%), wrong direction ${wrong}`);
  check(right / Math.max(1, should) > 0.8 && wrong < should * 0.05, 'real footage: stepping sideways strafes the right way');
}
if (fail) process.exitCode = 1;
