// Per-frame trace of one drill rep through the real recognizer: size vs spot, quiet gate, fwd/strafe raw and output.
// Usage: npx tsx tests/tools/drill-trace.ts <session> <label> <rep>
import fs from 'fs';
import path from 'path';
import { GestureRecognizer } from '../../shared/gestures';
const [s, lab, rep] = process.argv.slice(2);
const fr = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../clips/research', s + '.json'), 'utf8')).frames;
const rec = new GestureRecognizer();
rec.beginCalibration();
let t0 = -1, after = 0;
for (const f of fr) {
  const p = f.people[0];
  const o = rec.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t);
  const inRep = f.label === lab && String(f.rep) === rep;
  if (inRep && t0 < 0) t0 = f.t;
  if (t0 < 0 && !(fr.find((g: any) => g.label === lab && String(g.rep) === rep)?.t - f.t < 0.6)) continue;
  if (t0 >= 0 && (f.t - t0 > 3.2 || (f.label && !inRep))) break;
  const d = (o.debug ?? {}) as Record<string, number>;
  const x = (v: number | undefined) => (v ?? 0).toFixed(2).padStart(5);
  console.log(`${x(f.t - (t0 < 0 ? f.t : t0))} ${inRep ? '*' : ' '} size ${x(Math.exp(d.size ?? 0))} spot ${x(Math.exp(d.spot ?? 0))} dev ${x(d.ratio)} yaw ${x(((d.yaw ?? 0) * 180) / Math.PI)} q ${d.quiet} sp ${x(d.lSp)} ${x(d.rSp)} fwdRaw ${x(d.fwdRaw)} strRaw ${x(d.strafeRaw)} -> move ${x(o.move[0])} ${x(o.move[1])} ${o.actions.map((a) => a.kind + a.hand).join(' ')}`);
}
