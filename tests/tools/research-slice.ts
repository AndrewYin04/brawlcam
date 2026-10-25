// Cuts a slice of an exact research session (clips/research/<id>-exact.json) into a record-mode landmark clip
// (clips/landmarks/<name>.json): resampled to a uniform 30 fps by capture time (record mode indexes frames at 30 fps),
// with the matching webcam-video time of the first frame (sourceVideoStart, seconds) for picture-in-picture sync.
// Usage: npx tsx tests/tools/research-slice.ts <session-exact> <videoStartSec> <videoEndSec> <name>
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const [sess, vs, ve, name] = process.argv.slice(2);
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/research', sess + '.json'), 'utf8'));
const fr = src.frames.filter((f: any) => f.people?.[0]);
// Map video time (at, ms since the session start, stamped when the frame's result arrived) to capture time t.
const i0 = fr.findIndex((f: any) => f.at >= +vs * 1000);
const i1 = fr.findIndex((f: any) => f.at >= +ve * 1000);
const t0 = fr[i0].t, t1 = fr[i1 < 0 ? fr.length - 1 : i1].t;
const out: any[] = [];
let j = i0;
for (let k = 0; t0 + k / 30 <= t1; k++) {
  const tt = t0 + k / 30;
  while (j + 1 < fr.length && fr[j + 1].t <= tt) j++;
  out.push({ t: +(k / 30).toFixed(4), people: fr[j].people });
}
const sourceVideoStart = fr[i0].at / 1000;
fs.writeFileSync(path.join(ROOT, 'clips/landmarks', name + '.json'), JSON.stringify({ name, source: sess, sourceVideoStart, fps: 30, frames: out }));
console.log(name, out.length, 'frames', (out.length / 30).toFixed(1), 's; video start', sourceVideoStart.toFixed(3));
