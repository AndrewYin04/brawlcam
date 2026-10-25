// Scores research recordings (the .jsonl from ?research=1) against the player's own markers.
//   did:<move> marker  -> the move was done: TP if the recognizer fired that move in the 1.2 s before, else FN
//   missed marker      -> a move was done and nothing registered: FN (move unknown)
//   false_fire marker  -> the most recent action in the 1.5 s before was a false positive
// --replay re-runs the saved landmarks through the CURRENT GestureRecognizer (to test tuning changes).
// Usage: npx tsx tests/tools/research-score.ts [--replay] file.jsonl [...]
import fs from 'fs';
import { GestureRecognizer } from '../../shared/gestures';
const args = process.argv.slice(2);
const replay = args.includes('--replay');
const files = args.filter((a) => !a.startsWith('--'));
const S: Record<string, { tp: number; fn: number; fp: number }> = {};
const st = (k: string) => (S[k] ??= { tp: 0, fn: 0, fp: 0 });
let missed = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const frames = lines.filter((l) => l.world);
  const acts: { at: number; kind: string }[] = [];
  if (replay) {
    const rec = new GestureRecognizer();
    rec.skipCalibration({});
    for (const f of frames) for (const a of rec.update({ t: f.t, world: f.world, image: f.image }, f.t).actions) acts.push({ at: f.at, kind: a.kind });
  } else for (const f of frames) for (const a of f.actions ?? []) acts.push({ at: f.at, kind: a.kind });
  const map = (k: string) => (k === 'palm' ? 'palm' : k);
  for (const m of lines.filter((l) => l.marker && !l.world)) {
    if (m.marker.startsWith('did:')) {
      const mv = m.marker.slice(4);
      if (mv.startsWith('step')) continue; // movement markers are scored from the move input separately
      const hit = acts.some((a) => map(a.kind) === mv && a.at <= m.at && a.at >= m.at - 1200);
      if (hit) st(mv).tp++;
      else st(mv).fn++;
    } else if (m.marker === 'missed') missed++;
    else if (m.marker === 'false_fire') {
      const last = acts.filter((a) => a.at <= m.at && a.at >= m.at - 1500).pop();
      if (last) st(map(last.kind)).fp++;
    }
  }
  console.log(`${file}: ${frames.length} frames, ${acts.length} actions${replay ? ' (replayed)' : ''}`);
}
for (const [k, v] of Object.entries(S)) console.log(`${k.padEnd(9)} recall ${v.tp + v.fn ? ((v.tp / (v.tp + v.fn)) * 100).toFixed(0) + '%' : '-'} (${v.tp}/${v.tp + v.fn})  false fires ${v.fp}`);
console.log(`unlabeled misses (Space): ${missed}`);
