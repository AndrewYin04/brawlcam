// Per-frame trace of a drill session's grab (or any label's) reps through the real recognizer: arm extension, elbow,
// wrist height, wrist gap, grapple reach state, recognizer debug notes, and actions.
// Usage: npx tsx tests/tools/grab-trace.ts <session> [label=grab] [rep] [--grapple]
import fs from 'fs';
import path from 'path';
import { GestureRecognizer } from '../../shared/gestures';
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const [s, lab = 'grab', repArg] = pos;
const fr = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../clips/research', s.endsWith('.json') ? s : s + '.json'), 'utf8')).frames;
const rec = new GestureRecognizer();
if (args.includes('--grapple')) (rec as unknown as { grappleEnabled: boolean }).grappleEnabled = true;
rec.debugLog = [];
rec.beginCalibration();
const starts = new Map<string, number>();
for (const f of fr) if (f.label === lab && !starts.has(String(f.rep))) starts.set(String(f.rep), f.t);
const want = [...starts.entries()].filter(([r]) => !repArg || r === repArg);
for (const f of fr) {
  const p = f.people[0];
  rec.debugLog.length = 0;
  const o = rec.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t);
  const hit = want.find(([, t0]) => f.t >= t0 - 0.5 && f.t <= t0 + 3);
  if (!hit) continue;
  const d = (o.debug ?? {}) as Record<string, number>;
  const x = (v: number | undefined, n = 2) => (v ?? 0).toFixed(n).padStart(5);
  const g = (rec.grapple as any).reach;
  const st = g ? `reach@${(g.t - hit[1]).toFixed(2)} sync ${g.sync.toFixed(2)} up ${g.upL.toFixed(2)}/${g.upR.toFixed(2)} pk ${g.peakL.toFixed(2)}/${g.peakR.toFixed(2)} lo ${g.loL.toFixed(2)}/${g.loR.toFixed(2)}${g.pulled ? ' PULLED' : ''}${g.releasedAt >= 0 ? ' rel' : ''}` : '';
  const w = p?.world;
  console.log(`r${hit[0]} ${x(f.t - hit[1])} ${f.label === lab ? '*' : ' '} ext ${x(d.lExt)} ${x(d.rExt)} el ${x(d.lEl, 0)} ${x(d.rEl, 0)} sp ${x(d.lSp)} ${x(d.rSp)} ${st}  ${o.actions.map((a) => a.kind + a.hand).join(' ')}${rec.debugLog.length ? '  | ' + rec.debugLog.map((l) => l.replace(/^\S+ /, '')).join(' | ') : ''}`);
}
