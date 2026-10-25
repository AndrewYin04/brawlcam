// Replays two-person clip landmarks through PeopleAssigner and counts identity swaps.
// A swap = a slot's shoulder-center x jumps by more than 0.12 (normalized) between consecutive frames
// while the other slot's person was near where this one jumped to.
import fs from 'fs';
import path from 'path';
import { PeopleAssigner } from '../../shared/assign';
const ROOT = path.resolve(import.meta.dirname, '../..');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['ufc_01', 'ufc_02', 'ufc_03', 'ufc_04', 'ufc_05', 'ufc_06', 'ufc_07', 'ufc_08', 'duo_01', 'duo_02'];
const stride = Number(process.env.STRIDE ?? 2);
let total = { frames: 0, swaps: 0, rawSwaps: 0, both: 0 };
for (const n of names) {
  const f = path.join(ROOT, 'clips/landmarks', n + '.json');
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const a = new PeopleAssigner(2);
  let prev: (number | null)[] = [null, null];
  let prevRaw: number[] = [];
  let swaps = 0, rawSwaps = 0, both = 0, frames = 0;
  const cx = (p: any) => (p.image[11][0] + p.image[12][0]) / 2;
  for (const [i, fr] of d.frames.entries()) {
    if (i % stride) continue;
    frames++;
    // SHUFFLE=1: randomize detection order every frame (adversarial: the assigner must keep identities).
    const people = process.env.SHUFFLE ? [...fr.people].sort(() => Math.random() - 0.5) : fr.people;
    const out = a.assign(people, fr.t);
    const cur = out.map((p: any) => (p ? cx(p) : null));
    if (fr.people.length === 2) both++;
    for (let s = 0; s < 2; s++) {
      const o = 1 - s;
      if (cur[s] != null && prev[s] != null && Math.abs(cur[s]! - prev[s]!) > 0.12 && prev[o] != null && Math.abs(cur[s]! - prev[o]!) < 0.06) swaps++;
    }
    const raw = fr.people.map(cx);
    if (raw.length === 2 && prevRaw.length === 2 && Math.abs(raw[0] - prevRaw[0]) > 0.12 && Math.abs(raw[0] - prevRaw[1]) < 0.06) rawSwaps++;
    prev = cur;
    prevRaw = raw;
  }
  console.log(`${n}: frames ${frames}, both visible ${both}, assigner swaps ${swaps}, raw MediaPipe order swaps ${rawSwaps}`);
  total.frames += frames; total.swaps += swaps; total.rawSwaps += rawSwaps; total.both += both;
}
console.log('TOTAL', JSON.stringify(total));
