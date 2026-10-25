// Per-rep strike features from drill sessions (same avatar space as the recognizer): for each punch rep and each hand,
// the largest rise within a 0.35 s window of: lateral sweep toward the midline (u), wrist height (y), elbow angle and
// arm extension, plus the torso yaw change. Usage: npx tsx tests/tools/strike-features.ts <session> [...]
import fs from 'fs';
import path from 'path';
import { mpWorldToAvatar, MP_INDEX, J } from '../../shared/joints';
const ROOT = path.resolve(import.meta.dirname, '../..');
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
const len = (a: number[]) => Math.hypot(...a);
const ang = (a: number[], b: number[]) => (Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b) || 1)))) * 180) / Math.PI;
const PUNCH = ['hook_R_big', 'hook_L_big', 'straight_big', 'uppercut_big', 'grab', 'throw'];
for (const s of process.argv.slice(2)) {
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/research', s + '.json'), 'utf8')).frames;
  const feats = fr.map((f: any) => {
    const p = f.people[0];
    if (!p) return null;
    const P = MP_INDEX.map((i: number) => mpWorldToAvatar(p.world[i][0], p.world[i][1], p.world[i][2]));
    const lS = P[J.lSh], rS = P[J.rSh], MS = lS.map((v: number, i: number) => (v + rS[i]) / 2);
    const yaw = (Math.atan2(-(lS[2] - rS[2]), lS[0] - rS[0]) * 180) / Math.PI;
    const arm = (h: 'L' | 'R') => {
      const S = h === 'L' ? lS : rS, E = h === 'L' ? P[J.lEl] : P[J.rEl], W = h === 'L' ? P[J.lWr] : P[J.rWr];
      const side = h === 'L' ? 1 : -1;
      return { u: -side * (W[0] - MS[0]), y: W[1] - MS[1], z: W[2] - MS[2], el: ang(sub(S, E), sub(W, E)), ext: len(sub(W, S)) };
    };
    return { t: f.t, yaw, L: arm('L'), R: arm('R') };
  });
  console.log(`session ${s}  (rise = max increase within 0.35 s; yaw = max change within 0.35 s)`);
  for (const lab of PUNCH) {
    const reps = [...new Set(fr.filter((f: any) => f.label === lab).map((f: any) => f.rep))];
    for (const r of reps) {
      const ii = fr.map((f: any, i: number) => (f.label === lab && f.rep === r ? i : -1)).filter((i: number) => i >= 0);
      const t0 = fr[ii[0]].t;
      const idx = fr.map((f: any, i: number) => (f.t >= t0 && f.t <= t0 + 3 ? i : -1)).filter((i: number) => i >= 0 && feats[i]);
      const rise = (h: 'L' | 'R', k: 'u' | 'y' | 'el' | 'ext' | 'z') => { let best = 0; for (const i of idx) for (const j of idx) if (fr[j].t > fr[i].t && fr[j].t - fr[i].t <= 0.35) best = Math.max(best, feats[j][h][k] - feats[i][h][k]); return best; };
      const yawCh = () => { let best = 0; for (const i of idx) for (const j of idx) if (fr[j].t > fr[i].t && fr[j].t - fr[i].t <= 0.35) best = Math.max(best, Math.abs(feats[j].yaw - feats[i].yaw)); return best; };
      const elMax = (h: 'L' | 'R') => Math.max(...idx.map((i: number) => feats[i][h].el));
      const line = (['L', 'R'] as const).map((h) => `${h}: sweep ${rise(h, 'u').toFixed(2)} rise ${rise(h, 'y').toFixed(2)} fwd ${rise(h, 'z').toFixed(2)} ext+ ${rise(h, 'ext').toFixed(2)} elbow+ ${rise(h, 'el').toFixed(0).padStart(3)} max ${elMax(h).toFixed(0)}`).join('  |  ');
      console.log(`${lab.padEnd(13)} r${String(r).padEnd(3)} yaw ${yawCh().toFixed(0).padStart(3)}°  ${line}`);
    }
  }
}
