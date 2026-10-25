// Runs the real GestureRecognizer over every clips/landmarks/*.json (first tracked person, calibrated from the clip like
// eval-gestures.ts) and reports grab / throw detections. None of the clips contains a deliberate grab or shoulder throw,
// so every detection on a single-person clip is a false trigger. The ufc_* / duo_* clips are real two-person footage
// and may contain genuine clinches; they are reported separately.
// Usage: npx tsx tests/tools/grapple-scan.ts [--verbose] [--json]
import fs from 'fs';
import path from 'path';
import { GestureRecognizer, type LM } from '../../shared/gestures';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'clips', 'landmarks');
const verbose = process.argv.includes('--verbose');

export interface ScanRow { clip: string; people: number; frames: number; grab: number[]; throw: number[]; palm: number[] }

export function scanClip(file: string): ScanRow {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { frames: { t: number; people: { image: LM[]; world: LM[] }[] }[] };
  const rec = new GestureRecognizer();
  const sw: number[] = [];
  const arm: number[] = [];
  const isw: number[] = [];
  let people = 0;
  for (const f of data.frames) {
    people = Math.max(people, f.people.length);
    const p = f.people[0];
    if (!p) continue;
    const w = p.world;
    const d = (a: number, b: number) => Math.hypot(w[a][0] - w[b][0], w[a][1] - w[b][1], w[a][2] - w[b][2]);
    sw.push(d(11, 12));
    arm.push((d(11, 13) + d(13, 15) + d(12, 14) + d(14, 16)) / 2);
    isw.push(Math.hypot(p.image[11][0] - p.image[12][0], p.image[11][1] - p.image[12][1]));
  }
  const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  rec.skipCalibration({ shoulderW: med(sw), armLen: Math.max(0.4, med(arm)), imgShoulderW: med(isw) });
  const row: ScanRow = { clip: path.basename(file, '.json'), people, frames: data.frames.length, grab: [], throw: [], palm: [] };
  for (const f of data.frames) {
    const p = f.people[0];
    const out = rec.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t);
    for (const a of out.actions) {
      if (a.kind === 'grab') row.grab.push(+a.t.toFixed(2));
      if (a.kind === 'throw') row.throw.push(+a.t.toFixed(2));
      if (a.kind === 'palm') row.palm.push(+a.t.toFixed(2));
    }
  }
  return row;
}

export function scanAll(): ScanRow[] {
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().map((f) => scanClip(path.join(DIR, f)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const rows = scanAll();
  let single = { grab: 0, throw: 0 };
  let multi = { grab: 0, throw: 0 };
  for (const r of rows) {
    const bucket = r.people > 1 ? multi : single;
    bucket.grab += r.grab.length;
    bucket.throw += r.throw.length;
    if (verbose || r.grab.length || r.throw.length)
      console.log(`${r.clip.padEnd(16)} people ${r.people} frames ${String(r.frames).padStart(4)}  grab ${r.grab.length}${r.grab.length ? ' @' + r.grab.join(',') : ''}  throw ${r.throw.length}${r.throw.length ? ' @' + r.throw.join(',') : ''}`);
  }
  console.log(`\n${rows.length} clips. Single-person clips (all are false triggers): grab ${single.grab}, throw ${single.throw}. Two-person clips (may be real clinches): grab ${multi.grab}, throw ${multi.throw}.`);
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows));
}
