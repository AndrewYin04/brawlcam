// Grab / Shoulder Throw gesture detection (planner spec 2026-10-25 2:50 AM, section B).
// 1. No cross-triggers: the real recognizer runs over EVERY clips/landmarks/*.json; grab and throw must never fire
//    (no clip contains a deliberate grab or throw: guard, block, X, palm push / energy blast, jabs, hooks, uppercuts,
//    kicks, knees, shadow boxing, walking, UFC footage).
// 2. Positives: synthetic "reach and pull" and "reach, twist and hinge" sequences built by moving the arm / torso
//    landmarks of a real guard clip (guard_01) over time, at 30 and 15 fps.
// 3. Near misses that must NOT fire: push-and-hold (energy blast), pulling back too late, arms out one after the
//    other (a one-two), pulling back only to the guard, twisting without hinging, hinging without twisting.
import fs from 'fs';
import path from 'path';
import { GestureRecognizer, GRAPPLE_CFG, type LM } from '../../shared/gestures';
import { scanAll } from '../tools/grapple-scan';

const ROOT = path.resolve(import.meta.dirname, '../..');
let fail = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fail = true;
};

// ---------- 1. every real clip: zero grab / throw ----------
{
  const rows = scanAll();
  let grabs = 0;
  let throws = 0;
  for (const r of rows) {
    grabs += r.grab.length;
    throws += r.throw.length;
    if (r.grab.length || r.throw.length) console.log(`     ${r.clip}: grab @${r.grab.join(',') || '-'} throw @${r.throw.join(',') || '-'}`);
  }
  const palmClips = rows.filter((r) => r.clip.startsWith('palmpush')).map((r) => `${r.clip} palm x${r.palm.length}`);
  check(rows.length >= 30, `scanned ${rows.length} landmark clips`);
  check(grabs === 0, `no grab false triggers on real clips (got ${grabs})`);
  check(throws === 0, `no throw false triggers on real clips (got ${throws})`);
  console.log(`     (recognizer palm detections on the energy-blast clips, unchanged by this feature: ${palmClips.join(', ')})`);
}

// ---------- synthetic sequences from a real guard clip ----------
type Frame = { t: number; people: { image: LM[]; world: LM[] }[] };
const guard = (JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/landmarks/guard_01.json'), 'utf8')) as { frames: Frame[] }).frames;
const W = (f: Frame) => f.people[0].world;
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const dist = (w: LM[], a: number, b: number) => Math.hypot(w[a][0] - w[b][0], w[a][1] - w[b][1], w[a][2] - w[b][2]);
const ARM = Math.max(0.4, med(guard.map((f) => (dist(W(f), 11, 13) + dist(W(f), 13, 15) + dist(W(f), 12, 14) + dist(W(f), 14, 16)) / 2)));
const SW = med(guard.map((f) => dist(W(f), 11, 12)));
const ISW = med(guard.map((f) => Math.hypot(f.people[0].image[11][0] - f.people[0].image[12][0], f.people[0].image[11][1] - f.people[0].image[12][1])));

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Piecewise-linear keyframes [time, value] -> smoothstepped value at t. */
const keys = (k: [number, number][]) => (t: number) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * smooth((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  return k[k.length - 1][1];
};

// MediaPipe world space: x = image right (the person's left), y = down, z = away from the camera; forward is -z.
type V = [number, number, number];
const lerp = (a: V, b: V, k: number): V => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const HAND = { L: [15, 17, 19, 21], R: [16, 18, 20, 22] };

interface Script {
  /** 0 = guard, 1 = arms reached forward (per hand). */
  reachL: (t: number) => number;
  reachR: (t: number) => number;
  /** 0..1 blend of both wrists to the chest (applied on top of the reach blend). */
  pull: (t: number) => number;
  /** Where the pull ends: 'chest' (grab) or 'guard' (just returning to the guard pose). */
  pullTo?: 'chest' | 'guard';
  twistDeg?: (t: number) => number;
  hingeDeg?: (t: number) => number;
}

function synth(s: Script, dur: number, fps: number): Frame[] {
  const out: Frame[] = [];
  const n = Math.round(dur * fps);
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const src = guard[Math.round(t * 30) % guard.length];
    const w = src.people[0].world.map((p) => [...p] as LM);
    const lS = w[11];
    const rS = w[12];
    const mS: V = [(lS[0] + rS[0]) / 2, (lS[1] + rS[1]) / 2, (lS[2] + rS[2]) / 2];
    for (const h of ['L', 'R'] as const) {
      const S = h === 'L' ? lS : rS;
      const sh: V = [S[0], S[1], S[2]];
      const wi = h === 'L' ? 15 : 16;
      const ei = h === 'L' ? 13 : 14;
      const side = h === 'L' ? 1 : -1;
      const g: V = [w[wi][0], w[wi][1], w[wi][2]];
      const ge: V = [w[ei][0], w[ei][1], w[ei][2]];
      // Reached: arm straight forward at chest height, wrists converging toward the midline.
      const reachW: V = [sh[0] - side * 0.06, sh[1] + 0.05, sh[2] - 0.95 * ARM];
      const reachE = lerp(sh, reachW, 0.5);
      // Pulled to the chest: wrists in front of the sternum, close together, elbows tucked down and out.
      const chestW: V = [mS[0] + side * 0.05, mS[1] + 0.1, mS[2] - 0.06];
      const chestE: V = [sh[0] + side * 0.06, sh[1] + 0.24, sh[2] - 0.02];
      const pullW = s.pullTo === 'guard' ? g : chestW;
      const pullE = s.pullTo === 'guard' ? ge : chestE;
      const r = h === 'L' ? s.reachL(t) : s.reachR(t);
      const p = s.pull(t);
      const wt = lerp(lerp(g, reachW, r), pullW, p);
      const et = lerp(lerp(ge, reachE, r), pullE, p);
      const dw: V = [wt[0] - g[0], wt[1] - g[1], wt[2] - g[2]];
      for (const k of HAND[h]) for (let a = 0; a < 3; a++) w[k][a] += dw[a];
      w[ei][0] = et[0]; w[ei][1] = et[1]; w[ei][2] = et[2];
    }
    // Torso: hinge forward (pitch toward the camera about the hip centre), then twist (yaw about the vertical axis).
    const hinge = ((s.hingeDeg?.(t) ?? 0) * Math.PI) / 180;
    const twist = ((s.twistDeg?.(t) ?? 0) * Math.PI) / 180;
    if (hinge || twist) {
      for (let k = 0; k <= 22; k++) {
        let [x, y, z] = w[k];
        [y, z] = [y * Math.cos(hinge) - z * Math.sin(hinge), y * Math.sin(hinge) + z * Math.cos(hinge)];
        [x, z] = [x * Math.cos(twist) + z * Math.sin(twist), -x * Math.sin(twist) + z * Math.cos(twist)];
        w[k][0] = x; w[k][1] = y; w[k][2] = z;
      }
    }
    out.push({ t, people: [{ image: src.people[0].image, world: w }] });
  }
  return out;
}

function run(frames: Frame[]) {
  const rec = new GestureRecognizer();
  rec.skipCalibration({ shoulderW: SW, armLen: ARM, imgShoulderW: ISW });
  const acts: { t: number; kind: string }[] = [];
  if (process.env.GDEBUG) {
    const g = rec.grapple;
    const orig = g.update.bind(g);
    g.update = (x) => {
      console.log(`       ${x.t.toFixed(2)} eL ${x.extL.toFixed(2)} eR ${x.extR.toFixed(2)} gap/sw ${(x.gap / x.sw).toFixed(2)} yaw ${((x.yaw * 180) / Math.PI).toFixed(0)} shH ${x.shH.toFixed(2)} torso ${x.torso.toFixed(2)}`);
      return orig(x);
    };
  }
  for (const f of frames) {
    const p = f.people[0];
    for (const a of rec.update({ t: f.t, world: p.world, image: p.image }, f.t).actions) acts.push({ t: +a.t.toFixed(2), kind: a.kind });
  }
  return acts;
}
const fmt = (a: { t: number; kind: string }[]) => a.map((x) => `${x.kind}@${x.t}`).join(' ') || '(none)';
const count = (a: { t: number; kind: string }[], k: string) => a.filter((x) => x.kind === k).length;

// Timeline: 1.0 s guard, reach over 0.22 s, short hold, pull over 0.2 s, hold at the chest, back to guard.
const T0 = 1.0;
const reachTo = (t0: number, hold: number) => keys([[t0, 0], [t0 + 0.22, 1], [t0 + 0.22 + hold, 1], [t0 + 0.22 + hold + 0.2, 0]]);
const grabScript = (pullStart: number, sync = 0, to: 'chest' | 'guard' = 'chest'): Script => ({
  reachL: reachTo(T0, pullStart - T0 - 0.22),
  reachR: reachTo(T0 + sync, pullStart - T0 - 0.22 - sync),
  pull: keys([[pullStart, 0], [pullStart + 0.2, 1], [pullStart + 0.8, 1], [pullStart + 1.1, 0]]),
  pullTo: to,
});

// ---------- 2. positives ----------
for (const fps of [30, 15]) {
  const a = run(synth(grabScript(T0 + 0.35), 3, fps));
  check(count(a, 'grab') === 1 && count(a, 'throw') === 0, `${fps} fps reach-and-pull -> exactly one grab, no throw: ${fmt(a)}`);
  // Spec: the second arm may arrive up to 0.25 s after the first.
  const b = run(synth(grabScript(T0 + 0.5, 0.18), 3, fps));
  check(count(b, 'grab') === 1, `${fps} fps reach-and-pull with the arms 0.18 s apart -> grab: ${fmt(b)}`);
}
for (const fps of [30, 15]) {
  // Reach, then within 0.8 s twist 75 deg and hinge forward 40 deg (shoulders drop ~23% of the torso length).
  const s: Script = {
    reachL: keys([[T0, 0], [T0 + 0.22, 1]]),
    reachR: keys([[T0, 0], [T0 + 0.22, 1]]),
    pull: () => 0,
    twistDeg: keys([[T0 + 0.25, 0], [T0 + 0.65, 75], [T0 + 1.6, 75], [T0 + 2.0, 0]]),
    hingeDeg: keys([[T0 + 0.3, 0], [T0 + 0.65, 40], [T0 + 1.6, 40], [T0 + 2.0, 0]]),
  };
  const a = run(synth(s, 3.5, fps));
  check(count(a, 'throw') === 1 && count(a, 'grab') === 0, `${fps} fps reach-twist-hinge -> exactly one throw: ${fmt(a)}`);
  // Twisting the other way works too.
  const s2 = { ...s, twistDeg: keys([[T0 + 0.25, 0], [T0 + 0.65, -70], [T0 + 1.6, -70], [T0 + 2.0, 0]]) };
  const b = run(synth(s2, 3.5, fps));
  check(count(b, 'throw') === 1, `${fps} fps reach-twist(-70)-hinge -> throw: ${fmt(b)}`);
}
{
  // The judo entry most players will do: reach, pull (grab), then twist and hinge -> grab then throw.
  const s: Script = {
    ...grabScript(T0 + 0.35),
    twistDeg: keys([[T0 + 0.55, 0], [T0 + 0.95, 80], [T0 + 1.8, 80], [T0 + 2.2, 0]]),
    hingeDeg: keys([[T0 + 0.55, 0], [T0 + 0.95, 40], [T0 + 1.8, 40], [T0 + 2.2, 0]]),
  };
  const a = run(synth(s, 3.5, 30));
  check(count(a, 'grab') === 1 && count(a, 'throw') === 1 && a.find((x) => x.kind === 'grab')!.t < a.find((x) => x.kind === 'throw')!.t, `reach, pull, twist and hinge -> grab then throw: ${fmt(a)}`);
}

// ---------- 3. near misses ----------
{
  // Energy blast: palms pushed forward and HELD (1.2 s), then lowered back to the guard.
  const s: Script = { reachL: reachTo(T0, 1.2), reachR: reachTo(T0, 1.2), pull: () => 0 };
  const a = run(synth(s, 3.5, 30));
  check(count(a, 'grab') === 0 && count(a, 'throw') === 0, `push and hold (energy blast) -> no grab/throw: ${fmt(a)}`);
}
{
  // Pulled to the chest, but too late (0.75 s after the reach > pullWindow 0.5 s).
  const a = run(synth(grabScript(T0 + 0.22 + 0.75), 3.5, 30));
  check(count(a, 'grab') === 0, `pull to the chest after ${0.75} s -> no grab: ${fmt(a)}`);
}
{
  // One arm after the other, 0.35 s apart (a one-two), then both to the chest.
  const a = run(synth(grabScript(T0 + 0.75, 0.35), 3.5, 30));
  check(count(a, 'grab') === 0, `arms out 0.35 s apart (> ${GRAPPLE_CFG.reachSync} s) -> no grab: ${fmt(a)}`);
}
{
  // Reach, then back to the normal guard instead of the chest (guard extension ~0.7 > pullExt 0.45).
  const a = run(synth(grabScript(T0 + 0.35, 0, 'guard'), 3, 30));
  check(count(a, 'grab') === 0, `reach then back to the guard (not the chest) -> no grab: ${fmt(a)}`);
}
{
  const base = { reachL: keys([[T0, 0], [T0 + 0.22, 1]]), reachR: keys([[T0, 0], [T0 + 0.22, 1]]), pull: () => 0 };
  const a = run(synth({ ...base, twistDeg: keys([[T0 + 0.25, 0], [T0 + 0.65, 80]]) }, 3, 30));
  check(count(a, 'throw') === 0, `reach + twist 80 deg without hinging -> no throw: ${fmt(a)}`);
  const b = run(synth({ ...base, hingeDeg: keys([[T0 + 0.25, 0], [T0 + 0.65, 45]]) }, 3, 30));
  check(count(b, 'throw') === 0, `reach + hinge 45 deg without twisting -> no throw: ${fmt(b)}`);
  const c = run(synth({ ...base, twistDeg: keys([[T0 + 0.25, 0], [T0 + 0.65, 45]]), hingeDeg: keys([[T0 + 0.25, 0], [T0 + 0.65, 40]]) }, 3, 30));
  check(count(c, 'throw') === 0, `reach + twist 45 deg (< ${GRAPPLE_CFG.throwTwistDeg}) + hinge -> no throw: ${fmt(c)}`);
  const d = run(synth({ ...base, twistDeg: keys([[T0 + 0.9, 0], [T0 + 1.3, 80]]), hingeDeg: keys([[T0 + 0.9, 0], [T0 + 1.3, 40]]) }, 3, 30));
  check(count(d, 'throw') === 0, `twist + hinge finishing 1.3 s after the reach (> ${GRAPPLE_CFG.throwWindow} s) -> no throw: ${fmt(d)}`);
  const e = run(synth({ reachL: () => 0, reachR: () => 0, pull: () => 0, twistDeg: keys([[T0, 0], [T0 + 0.4, 80]]), hingeDeg: keys([[T0, 0], [T0 + 0.4, 40]]) }, 3, 30));
  check(count(e, 'throw') === 0, `twist + hinge with no reach first -> no throw: ${fmt(e)}`);
}
{
  // The untouched guard clip itself.
  const a = run(synth({ reachL: () => 0, reachR: () => 0, pull: () => 0 }, 6, 30));
  check(count(a, 'grab') === 0 && count(a, 'throw') === 0, `guard held 6 s -> nothing: ${fmt(a)}`);
}

console.log(fail ? 'FAIL' : 'PASS');
if (fail) process.exitCode = 1;
