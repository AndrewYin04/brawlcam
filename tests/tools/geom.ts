// Print block/X geometry (avatar space, meters) for a clip over a time range.
import fs from 'fs'; import path from 'path';
const [name, from = '0', to = '99', step = '0.2'] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../clips/landmarks', name + '.json'), 'utf8'));
const A = (w: number[]) => [w[0], -w[1], -w[2]];
let next = Number(from);
for (const f of d.frames) {
  if (f.t < next || f.t > Number(to)) continue; next = f.t + Number(step);
  const p = f.people[0]; if (!p) { console.log(f.t.toFixed(2), 'no person'); continue; }
  const w = p.world.map(A);
  const ms = [(w[11][0] + w[12][0]) / 2, (w[11][1] + w[12][1]) / 2];
  const sw = Math.abs(w[11][0] - w[12][0]);
  const r = (v: number) => v.toFixed(2);
  console.log(f.t.toFixed(2), `sw ${r(sw)} nose.y ${r(w[0][1] - ms[1])} | lW x ${r(w[15][0] - ms[0])} y ${r(w[15][1] - ms[1])} z ${r(w[15][2])} | rW x ${r(w[16][0] - ms[0])} y ${r(w[16][1] - ms[1])} z ${r(w[16][2])} | lE x ${r(w[13][0] - ms[0])} y ${r(w[13][1] - ms[1])} | rE x ${r(w[14][0] - ms[0])} y ${r(w[14][1] - ms[1])} | img lWx ${r(p.image[15][0])} rWx ${r(p.image[16][0])} vis ${r(p.image[15][3])},${r(p.image[16][3])}`);
}
