// Print per-frame arm signals for one clip (debugging gesture thresholds).
import fs from 'fs';
import path from 'path';
const name = process.argv[2];
const from = Number(process.argv[3] ?? 0), to = Number(process.argv[4] ?? 99);
const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../clips/landmarks', name + '.json'), 'utf8'));
const A = (w: number[]) => [w[0], -w[1], -w[2]];
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const len = (a: number[]) => Math.hypot(...a);
const ang = (a: number[], b: number[]) => (Math.acos(Math.max(-1, Math.min(1, (a[0]*b[0]+a[1]*b[1]+a[2]*b[2]) / (len(a)*len(b))))) * 180) / Math.PI;
let prev: any = null;
for (const f of d.frames) {
  const p = f.people[0]; if (!p) continue;
  const w = p.world.map(A);
  const row: any = { t: f.t.toFixed(2) };
  for (const [h, s, e, wr] of [['L', 11, 13, 15], ['R', 12, 14, 16]] as const) {
    const S = w[s], E = w[e], W = w[wr];
    const ms = [(w[11][0]+w[12][0])/2,(w[11][1]+w[12][1])/2,(w[11][2]+w[12][2])/2];
    const rel = sub(W, ms);
    row[h+'ext'] = len(sub(W, S)).toFixed(2); row[h+'elb'] = ang(sub(S,E), sub(W,E)).toFixed(0);
    row[h+'rel'] = rel.map((x) => x.toFixed(2)).join(',');
    row[h+'vis'] = p.world[wr][3].toFixed(2);
    if (prev) { const v = sub(rel, prev[h]); row[h+'sp'] = (len(v) * 30).toFixed(1); }
    row['_'+h] = rel;
  }
  prev = { L: row._L, R: row._R };
  delete row._L; delete row._R;
  if (f.t >= from && f.t <= to) console.log(Object.values(row).join('  '));
}
