// Replays dumped clip landmarks through the real GestureRecognizer and scores it against
// clips/groundtruth.json (events within ±300 ms). Prints per-move precision and recall.
// Usage: npx tsx tests/tools/eval-gestures.ts [--verbose] [name ...]
import fs from 'fs';
import path from 'path';
import { GestureRecognizer, type LM } from '../../shared/gestures';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CLIPS = path.join(ROOT, 'clips');
const TOL = 0.3;
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const only = args.filter((a) => !a.startsWith('--'));

interface GtEvent { t?: number; start?: number; end?: number; kind: string; hand?: string; uncertain?: boolean }
interface GtClip { name: string; people?: number; events: GtEvent[]; skipEval?: boolean }

const evalCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/gesture-eval.json'), 'utf8')) as { exhaustive: string[] };
const gt: { clips: GtClip[] } = JSON.parse(fs.readFileSync(process.env.GT_FILE ?? path.join(CLIPS, 'groundtruth.json'), 'utf8'));
const POINT = ['jab', 'hook', 'uppercut', 'palmpush', 'kick', 'knee'];
const STATE = ['block', 'xshield'];
const stats: Record<string, { tp: number; fp: number; fn: number }> = {};
const S = (k: string) => (stats[k] ??= { tp: 0, fp: 0, fn: 0 });

// Map recognizer kinds to ground-truth kinds.
const mapKind = (k: string) => (k === 'palm' ? 'palmpush' : k);

export function runClip(name: string) {
  const file = path.join(CLIPS, 'landmarks', name + '.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { frames: { t: number; people: { image: LM[]; world: LM[] }[] }[] };
  const rec = new GestureRecognizer();
  // Calibrate from the clip itself (median body size), since clips do not start with a guard hold.
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
  const actions: { t: number; kind: string; hand: string; speed: number }[] = [];
  const states: Record<string, { start: number; end: number }[]> = { block: [], xshield: [] };
  const on: Record<string, number> = {};
  const stride = Number(process.env.STRIDE ?? 1);
  for (const [fi, f] of data.frames.entries()) {
    if (fi % stride) continue;
    const p = f.people[0];
    const out = rec.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t);
    for (const a of out.actions) if (a.kind !== 'xshield') actions.push({ t: a.t, kind: mapKind(a.kind), hand: a.hand, speed: +a.speed.toFixed(2) });
    for (const k of STATE) {
      const v = k === 'block' ? out.blocking : out.xshield;
      if (v && on[k] === undefined) on[k] = f.t;
      if (!v && on[k] !== undefined) {
        states[k].push({ start: on[k], end: f.t });
        delete on[k];
      }
    }
  }
  const last = data.frames[data.frames.length - 1]?.t ?? 0;
  for (const k of STATE) if (on[k] !== undefined) states[k].push({ start: on[k], end: last });
  return { actions, states };
}

function score(clip: GtClip, res: NonNullable<ReturnType<typeof runClip>>) {
  const lines: string[] = [];
  // Point events
  const used = new Set<number>();
  for (const kind of POINT) {
    const gts = clip.events.filter((e) => e.kind === kind && e.t !== undefined);
    const dets = res.actions.map((a, i) => ({ ...a, i })).filter((a) => a.kind === kind || (kind === 'kick' && a.kind === 'kick'));
    for (const g of gts) {
      const m = dets.find((d) => !used.has(d.i) && Math.abs(d.t - g.t!) <= TOL);
      if (m) {
        used.add(m.i);
        if (!g.uncertain) S(kind).tp++;
      } else if (!g.uncertain) {
        S(kind).fn++;
        lines.push(`  MISS ${kind} ${g.hand ?? ''} @${g.t}`);
      }
    }
  }
  // Knee raises and front kicks both fire a "kick" action in the game.
  for (const [i, a] of res.actions.entries()) {
    if (used.has(i)) continue;
    if (a.kind === 'kick') {
      const g = clip.events.find((e) => (e.kind === 'knee' || e.kind === 'kick') && e.t !== undefined && Math.abs(e.t - a.t) <= TOL);
      if (g) {
        used.add(i);
        if (!g.uncertain) {
          S(g.kind).tp++;
          S(g.kind).fn = Math.max(0, S(g.kind).fn - 1);
        }
        continue;
      }
    }
    // A detection is a false positive unless it lines up with an uncertain label of any kind.
    const unc = clip.events.find((e) => e.uncertain && e.t !== undefined && Math.abs(e.t - a.t) <= TOL);
    if (!unc && evalCfg.exhaustive.includes(clip.name)) {
      S(a.kind).fp++;
      lines.push(`  FALSE ${a.kind} ${a.hand} @${a.t.toFixed(2)} speed ${a.speed}`);
    }
  }
  // State events (intervals)
  for (const kind of STATE) {
    const gts = clip.events.filter((e) => e.kind === kind && e.start !== undefined);
    const dets = res.states[kind];
    for (const g of gts) {
      const dur = g.end! - g.start!;
      const covered = dets.reduce((s, d) => s + Math.max(0, Math.min(d.end, g.end!) - Math.max(d.start, g.start!)), 0);
      if (covered >= 0.5 * dur) S(kind).tp++;
      else if (!g.uncertain) {
        S(kind).fn++;
        lines.push(`  MISS ${kind} ${g.start}-${g.end} (covered ${covered.toFixed(2)}s)`);
      }
    }
    for (const d of dets) {
      const overlaps = gts.some((g) => Math.min(d.end, g.end! + TOL) - Math.max(d.start, g.start! - TOL) > 0);
      if (!overlaps && d.end - d.start > 0.15 && evalCfg.exhaustive.includes(clip.name)) {
        S(kind).fp++;
        lines.push(`  FALSE ${kind} ${d.start.toFixed(2)}-${d.end.toFixed(2)}`);
      }
    }
  }
  return lines;
}

const summary: Record<string, unknown> = {};
for (const clip of gt.clips) {
  if (only.length && !only.includes(clip.name)) continue;
  if (clip.skipEval || (clip.people ?? 1) > 1) continue;
  const res = runClip(clip.name);
  if (!res) continue;
  const lines = score(clip, res);
  console.log(`${clip.name}: ${res.actions.length} actions, block ${res.states.block.length}, x ${res.states.xshield.length}`);
  if (verbose) {
    console.log('  detected:', res.actions.map((a) => `${a.kind}${a.hand}@${a.t.toFixed(2)}`).join(' '));
    console.log('  states:', JSON.stringify(res.states));
  }
  for (const l of lines) console.log(l);
}
console.log('\nmove       TP  FP  FN  precision  recall');
for (const [k, s] of Object.entries(stats)) {
  const p = s.tp + s.fp ? s.tp / (s.tp + s.fp) : NaN;
  const r = s.tp + s.fn ? s.tp / (s.tp + s.fn) : NaN;
  summary[k] = { ...s, precision: +p.toFixed(3), recall: +r.toFixed(3) };
  console.log(`${k.padEnd(10)} ${String(s.tp).padStart(3)} ${String(s.fp).padStart(3)} ${String(s.fn).padStart(3)}  ${isNaN(p) ? '  -  ' : (p * 100).toFixed(0).padStart(5) + '%'}     ${isNaN(r) ? '  -' : (r * 100).toFixed(0).padStart(4) + '%'}`);
}
fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'test-results', 'gesture-eval.json'), JSON.stringify({ at: new Date().toISOString(), summary }, null, 1));
