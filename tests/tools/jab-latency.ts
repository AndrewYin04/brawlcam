// Jab detection latency on real clips: for every jab the recognizer emits, the time from the punching arm's extension
// peak (max shoulder-to-wrist distance in the 0.35 s before the emitting frame) to the frame the jab is emitted on.
// Reported for jabs that match a ground-truth jab label (±0.3 s, clips/groundtruth.json) and for every jab on every clip.
// Usage: npx tsx tests/tools/jab-latency.ts            (current shared/gestures.ts)
//        GESTURES_MODULE=../../shared/_gestures_before.ts npx tsx tests/tools/jab-latency.ts   (compare another copy)
import fs from 'fs';
import path from 'path';
import type { LM } from '../../shared/gestures';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'clips', 'landmarks');
const mod = await import(process.env.GESTURES_MODULE ?? '../../shared/gestures');
const GestureRecognizer = mod.GestureRecognizer as typeof import('../../shared/gestures').GestureRecognizer;
const gt: { clips: { name: string; events: { t?: number; kind: string; uncertain?: boolean }[] }[] } = JSON.parse(fs.readFileSync(path.join(ROOT, 'clips', 'groundtruth.json'), 'utf8'));

export interface JabLat { clip: string; hand: string; t: number; emit: number; peak: number; lat: number; labeled: boolean }

export function latencies(file: string): JabLat[] {
  const name = path.basename(file, '.json');
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
  const labels = (gt.clips.find((c) => c.name === name)?.events ?? []).filter((e) => e.kind === 'jab' && e.t !== undefined);
  const hist: { t: number; L: number; R: number }[] = [];
  const out: JabLat[] = [];
  for (const f of data.frames) {
    const p = f.people[0];
    const o = rec.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t);
    if (o.debug) hist.push({ t: f.t, L: o.debug.lExt, R: o.debug.rExt });
    for (const a of o.actions) {
      if (a.kind !== 'jab' || (a.hand !== 'L' && a.hand !== 'R')) continue;
      let peak = f.t;
      let best = -1;
      for (const h of hist) if (h.t >= f.t - 0.35 && h.t <= f.t && h[a.hand] > best) [best, peak] = [h[a.hand], h.t];
      out.push({ clip: name, hand: a.hand, t: a.t, emit: f.t, peak, lat: f.t - peak, labeled: labels.some((e) => Math.abs(e.t! - a.t) <= 0.3) });
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const all = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().flatMap((f) => latencies(path.join(DIR, f)));
  const stat = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
    return `n ${String(s.length).padStart(3)}  mean ${(mean * 1000).toFixed(0).padStart(4)} ms  median ${((s[Math.floor(s.length / 2)] ?? 0) * 1000).toFixed(0).padStart(4)} ms  max ${((s[s.length - 1] ?? 0) * 1000).toFixed(0).padStart(4)} ms`;
  };
  if (process.argv.includes('--verbose')) for (const j of all) console.log(`${j.clip.padEnd(18)} jab${j.hand}@${j.t.toFixed(2)} peak ${j.peak.toFixed(2)} emit ${j.emit.toFixed(2)} lat ${(j.lat * 1000).toFixed(0)} ms${j.labeled ? ' (labeled)' : ''}`);
  console.log(`labeled jabs: ${stat(all.filter((j) => j.labeled).map((j) => j.lat))}`);
  console.log(`all jabs:     ${stat(all.map((j) => j.lat))}`);
}
