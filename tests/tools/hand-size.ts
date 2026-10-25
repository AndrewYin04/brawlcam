// Per-rep image-space "toward the camera" cue: hand size (wrist->index and wrist->pinky in the image, over the image
// shoulder width) rise within 0.5 s, per hand, plus whether both hands rise within 0.35 s of each other.
// Usage: npx tsx tests/tools/hand-size.ts <session>
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const [s] = process.argv.slice(2);
const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/research', s + '.json'), 'utf8')).frames;
const d = (im: number[][], a: number, b: number) => Math.hypot(im[a][0] - im[b][0], im[a][1] - im[b][1]);
const size = (f: any, h: 'L' | 'R') => { const im = f.people[0].image; const sw = d(im, 11, 12); const w = h === 'L' ? 15 : 16, i = h === 'L' ? 19 : 20, p = h === 'L' ? 17 : 18; return (d(im, w, i) + d(im, w, p)) / 2 / sw; };
const LAB = /grab|throw|straight|hook|upper/;
const keys = [...new Set(fr.filter((f: any) => f.label && LAB.test(f.label)).map((f: any) => f.label + '#' + f.rep))] as string[];
for (const k of keys) {
  const [lab, rep] = k.split('#');
  const i0 = fr.findIndex((f: any) => f.label === lab && String(f.rep) === rep);
  const t0 = fr[i0].t;
  const idx = fr.map((f: any, i: number) => (f.t >= t0 && f.t <= t0 + 3 && f.people[0] ? i : -1)).filter((i: number) => i >= 0);
  const best = (h: 'L' | 'R') => { let b = 0, at = 0; for (const i of idx) for (const j of idx) if (fr[j].t > fr[i].t && fr[j].t - fr[i].t <= 0.5) { const r = size(fr[j], h) / Math.max(1e-3, size(fr[i], h)); if (r > b) (b = r), (at = fr[j].t - t0); } return [b, at]; };
  const [bl, tl] = best('L'), [br, tr] = best('R');
  console.log(`${k.padEnd(16)} L x${bl.toFixed(2)} @${tl.toFixed(2)}  R x${br.toFixed(2)} @${tr.toFixed(2)}  both>=1.3 within 0.35s: ${bl >= 1.3 && br >= 1.3 && Math.abs(tl - tr) <= 0.35}`);
}
