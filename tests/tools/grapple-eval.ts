// Real-footage grab / Shoulder Throw evaluation (planner direction 2026-10-25, item 1).
// Replays clips/grapple/landmarks/*.json (dumped with CLIPS_DIR=clips/grapple tests/tools/dump-landmarks.ts) through the
// real GestureRecognizer (first tracked person, calibrated from the clip like eval-gestures.ts) and scores its 'grab' and
// 'throw' actions against clips/grapple/groundtruth.json. Labels are intervals; a detection matches when it falls inside
// [start - 0.5 s, end + 0.5 s]. Only kinds listed in a clip's "labeled" are scored there (recall and precision); other
// detections are counted raw. Also reports jab / palm (energy blast) cross-triggers: every jab or palm the recognizer
// emits on these clips (none of them contains a punch or a palm push), and how many land inside a labeled motion.
// The grapple sim condition "within range of a target" does not apply (solo drills): recognizer actions are scored directly.
// Usage: npx tsx tests/tools/grapple-eval.ts [--verbose]
//        GESTURES_MODULE=../../shared/_gestures_before.ts npx tsx tests/tools/grapple-eval.ts   (score another copy)
import fs from 'fs';
import path from 'path';
import type { LM } from '../../shared/gestures';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'clips', 'grapple');
const TOL = 0.5;
const verbose = process.argv.includes('--verbose');
const mod = await import(process.env.GESTURES_MODULE ?? '../../shared/gestures');
const GestureRecognizer = mod.GestureRecognizer as typeof import('../../shared/gestures').GestureRecognizer;

interface Ev { kind: string; start: number; end: number; finish?: boolean }
interface Clip { name: string; labeled: string[]; source?: string; events: Ev[] }
const gt: { clips: Clip[] } = JSON.parse(fs.readFileSync(path.join(DIR, 'groundtruth.json'), 'utf8'));

function run(name: string) {
  const file = path.join(DIR, 'landmarks', name + '.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { frames: { t: number; people: { image: LM[]; world: LM[] }[] }[] };
  const rec = new GestureRecognizer();
  const sw: number[] = [];
  const arm: number[] = [];
  const isw: number[] = [];
  for (const f of data.frames) {
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
  const acts: { t: number; kind: string; hand: string }[] = [];
  for (const f of data.frames) {
    const p = f.people[0];
    for (const a of rec.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t).actions) acts.push({ t: +f.t.toFixed(2), kind: a.kind, hand: a.hand });
  }
  return acts;
}

const S: Record<string, { tp: number; fp: number; fn: number; tpFinish: number; nFinish: number }> = {};
const stat = (k: string) => (S[k] ??= { tp: 0, fp: 0, fn: 0, tpFinish: 0, nFinish: 0 });
const cross: Record<string, { total: number; inMotion: number }> = { jab: { total: 0, inMotion: 0 }, palm: { total: 0, inMotion: 0 } };
const raw: string[] = [];
for (const clip of gt.clips) {
  const acts = run(clip.name);
  if (!acts) {
    console.log(`${clip.name}: no landmarks (run the dump tool)`);
    continue;
  }
  const inMotion = (t: number) => clip.events.some((e) => t >= e.start - TOL && t <= e.end + TOL);
  for (const k of ['jab', 'palm'] as const) {
    const xs = acts.filter((a) => a.kind === k);
    cross[k].total += xs.length;
    cross[k].inMotion += xs.filter((a) => inMotion(a.t)).length;
  }
  const lines: string[] = [];
  for (const kind of ['grab', 'throw']) {
    const dets = acts.filter((a) => a.kind === kind);
    if (!clip.labeled.includes(kind)) {
      if (dets.length) raw.push(`${clip.name}: ${kind} x${dets.length} (not labeled here) @${dets.map((d) => d.t).join(',')}`);
      continue;
    }
    const used = new Set<number>();
    for (const e of clip.events.filter((x) => x.kind === kind)) {
      const i = dets.findIndex((d, j) => !used.has(j) && d.t >= e.start - TOL && d.t <= e.end + TOL);
      if (e.finish) stat(kind).nFinish++;
      if (i >= 0) {
        used.add(i);
        stat(kind).tp++;
        if (e.finish) stat(kind).tpFinish++;
      } else {
        stat(kind).fn++;
        lines.push(`  MISS ${kind} ${e.start}-${e.end}${e.finish ? ' (finish)' : ''}`);
      }
    }
    dets.forEach((d, j) => {
      if (used.has(j)) return;
      stat(kind).fp++;
      lines.push(`  FALSE ${kind} @${d.t}`);
    });
  }
  const count = (k: string) => acts.filter((a) => a.kind === k).length;
  console.log(`${clip.name.padEnd(10)} labeled [${clip.labeled.join(',')}]  grab ${count('grab')} throw ${count('throw')} jab ${count('jab')} palm ${count('palm')} hook ${count('hook')} uppercut ${count('uppercut')} kick ${count('kick')}`);
  if (verbose) {
    console.log('  detected:', acts.map((a) => `${a.kind}${a.hand}@${a.t}`).join(' '));
    for (const l of lines) console.log(l);
  }
}
console.log('\nkind   TP  FP  FN  precision  recall  (finished reps: hit / labeled)');
for (const [k, s] of Object.entries(S)) {
  const p = s.tp + s.fp ? s.tp / (s.tp + s.fp) : NaN;
  const r = s.tp + s.fn ? s.tp / (s.tp + s.fn) : NaN;
  const pct = (x: number) => (isNaN(x) ? '   -' : `${(x * 100).toFixed(0).padStart(3)}%`);
  console.log(`${k.padEnd(6)} ${String(s.tp).padStart(3)} ${String(s.fp).padStart(3)} ${String(s.fn).padStart(3)}  ${pct(p)}       ${pct(r)}    ${s.tpFinish}/${s.nFinish}`);
}
for (const l of raw) console.log(l);
console.log(`cross-triggers on these clips (no punches or palm pushes in any of them): jab ${cross.jab.total} (${cross.jab.inMotion} inside a labeled grab/throw), palm/energy blast ${cross.palm.total} (${cross.palm.inMotion} inside)`);
