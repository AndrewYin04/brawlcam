// Procedural body poses for bots and for fighters without live pose data.
import { guardJoints, J, type Joints, type V3 } from './joints';

const UPPER = 0.27;
const FORE = 0.26;

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function len(a: V3) {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a: V3): V3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function dot(a: V3, b: V3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function lerp(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Two-bone IK: returns the elbow (or knee) position. */
export function solveIK(root: V3, target: V3, a: number, b: number, pole: V3): { mid: V3; end: V3 } {
  let d = sub(target, root);
  let dl = len(d);
  const maxL = a + b - 1e-3;
  if (dl > maxL) {
    d = scale(d, maxL / dl);
    dl = maxL;
  }
  const dir = norm(d);
  const x = (a * a - b * b + dl * dl) / (2 * dl);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const p = sub(pole, root);
  const perp = norm(sub(p, scale(dir, dot(p, dir))));
  const mid = add(add(root, scale(dir, x)), scale(perp, h));
  return { mid, end: add(root, d) };
}

/** Attack envelope: 0 -> 1 (extend) -> 0 (retract). */
function strikeCurve(age: number, ext = 0.09, hold = 0.06, ret = 0.2): number {
  if (age < 0) return 0;
  if (age < ext) return age / ext;
  if (age < ext + hold) return 1;
  if (age < ext + hold + ret) return 1 - (age - ext - hold) / ret;
  return 0;
}

export interface AnimState {
  atk: { k: string; h: string; age: number } | null;
  blocking: boolean;
  shield: boolean;
  stunned?: boolean;
  t: number; // seconds, for idle motion
  seed?: number;
}

export function proceduralJoints(s: AnimState): Joints {
  const j = guardJoints();
  const p = j.p;
  const ph = (s.seed ?? 0) * 1.7;
  // Idle bounce and sway
  const bob = Math.sin(s.t * 5 + ph) * 0.015;
  const sway = Math.sin(s.t * 2.2 + ph) * 0.03;
  for (const i of [J.nose, J.lEar, J.rEar, J.lSh, J.rSh, J.lEl, J.rEl, J.lWr, J.rWr]) {
    p[i][1] += bob;
    p[i][0] += sway;
  }

  let lW: V3 = p[J.lWr];
  let rW: V3 = p[J.rWr];
  const lS = p[J.lSh];
  const rS = p[J.rSh];

  if (s.shield) {
    lW = [-0.07, 0.52, 0.26];
    rW = [0.07, 0.55, 0.28];
  } else if (s.blocking) {
    lW = [0.08, 0.64 + bob, 0.17];
    rW = [-0.08, 0.64 + bob, 0.17];
  }

  let torsoTwist = 0;
  if (s.atk) {
    const { k, h, age } = s.atk;
    const right = h === 'R';
    const S = right ? rS : lS;
    const side = right ? -1 : 1;
    if (k === 'jab') {
      const c = strikeCurve(age);
      const tgt: V3 = [S[0] - side * 0.12, S[1] + 0.03, S[2] + 0.5];
      if (right) rW = lerp(rW, tgt, c);
      else lW = lerp(lW, tgt, c);
      torsoTwist = c * 0.25 * side;
    } else if (k === 'hook') {
      const c = strikeCurve(age, 0.12, 0.05, 0.22);
      const a = (1 - c) * 1.3; // sweep from the side to the center
      const tgt: V3 = [S[0] + side * Math.sin(a) * 0.35 - side * 0.12 * c, S[1] + 0.02, S[2] + Math.cos(a) * 0.4];
      if (right) rW = lerp(rW, tgt, Math.min(1, c * 1.5));
      else lW = lerp(lW, tgt, Math.min(1, c * 1.5));
      torsoTwist = c * 0.45 * side;
    } else if (k === 'uppercut' || k === 'super_uppercut') {
      const dur = k === 'super_uppercut' ? 2.5 : 1;
      const c = strikeCurve(age / dur, 0.12, 0.08, 0.22);
      const low: V3 = [S[0] - side * 0.05, 0.12, 0.25];
      const high: V3 = [S[0] - side * 0.1, 0.78, 0.32];
      const tgt = c < 0.5 ? lerp(low, high, c * 2) : high;
      const w = Math.min(1, c * 2.5);
      if (right) rW = lerp(rW, tgt, w);
      else lW = lerp(lW, tgt, w);
      torsoTwist = c * 0.3 * side;
    } else if (k === 'blast' || k === 'palm') {
      const c = strikeCurve(age, 0.12, 0.25, 0.25);
      lW = lerp(lW, [0.07, 0.46, 0.55], c);
      rW = lerp(rW, [-0.07, 0.46, 0.55], c);
    } else if (k === 'kick') {
      const c = strikeCurve(age, 0.12, 0.08, 0.25);
      const legRight = h !== 'L';
      const hip = legRight ? p[J.rHip] : p[J.lHip];
      const ankTarget: V3 = [hip[0], -0.05, 0.72];
      const ank = lerp(legRight ? p[J.rAnk] : p[J.lAnk], ankTarget, c);
      const ik = solveIK(hip, ank, 0.42, 0.42, [hip[0], hip[1] + 0.2, hip[2] + 1]);
      if (legRight) {
        p[J.rKnee] = ik.mid;
        p[J.rAnk] = ik.end;
      } else {
        p[J.lKnee] = ik.mid;
        p[J.lAnk] = ik.end;
      }
    }
  }
  if (s.stunned) torsoTwist += Math.sin(s.t * 40) * 0.05;

  // Twist the shoulders about the vertical axis.
  if (torsoTwist) {
    const c = Math.cos(torsoTwist);
    const sn = Math.sin(torsoTwist);
    for (const i of [J.lSh, J.rSh]) {
      const [x, y, z] = p[i];
      p[i] = [x * c + z * sn, y, -x * sn + z * c];
    }
  }

  const lE = solveIK(p[J.lSh], lW, UPPER, FORE, [p[J.lSh][0] + 0.25, p[J.lSh][1] - 0.4, p[J.lSh][2] - 0.05]);
  const rE = solveIK(p[J.rSh], rW, UPPER, FORE, [p[J.rSh][0] - 0.25, p[J.rSh][1] - 0.4, p[J.rSh][2] - 0.05]);
  p[J.lEl] = lE.mid;
  p[J.lWr] = lE.end;
  p[J.rEl] = rE.mid;
  p[J.rWr] = rE.end;
  return j;
}
