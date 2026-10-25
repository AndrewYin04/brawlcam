// Replays exported drill sessions (clips/research/*.json, from export-research.ts) through the real GestureRecognizer,
// with the same live guard calibration as the game, and scores every drill rep the way drills.ts does:
//   movement rep ✓ = move held past ±0.3 in the prompted direction for 0.3 s; strike rep ✓ = the prompted kind/hand fired.
// Prints per-label signed means (fwd, strafe), the share of frames with the right sign, and reps detected.
// Usage: npx tsx tests/tools/drill-replay.ts [session ...] [--recorded] [--json out.json]
//   --recorded  score the move/actions the live game recorded instead of replaying (fidelity check).
import fs from 'fs';
import path from 'path';
import { GestureRecognizer, type LM } from '../../shared/gestures';

const ROOT = path.resolve(import.meta.dirname, '../..');
type F = { t: number; people: { world: LM[]; image: LM[] }[]; label: string | null; rep: number | null; move?: number[]; actions?: { kind: string; hand: string }[] | null };
const EXPECT: Record<string, { kind?: string; hand?: string; dir?: 'fwd' | 'back' | 'left' | 'right' }> = {
  hook_R_big: { kind: 'hook', hand: 'R' }, hook_L_big: { kind: 'hook', hand: 'L' }, straight_big: { kind: 'jab' }, uppercut_big: { kind: 'uppercut' },
  grab: { kind: 'grab' }, throw: { kind: 'throw' },
  step_fwd: { dir: 'fwd' }, lean_fwd: { dir: 'fwd' }, step_back: { dir: 'back' }, lean_back: { dir: 'back' },
  step_left: { dir: 'left' }, lean_left: { dir: 'left' }, step_right: { dir: 'right' }, lean_right: { dir: 'right' },
};

export type LabelStats = { label: string; frames: number; fwd: number; strafe: number; rightSign: number; reps: number; hit: number; got: Record<string, number>; perRep: { rep: number; ok: boolean; got: string[] }[] };

export function replay(file: string, opts: { recorded?: boolean; configure?: (r: GestureRecognizer) => void } = {}) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { name: string; frames: F[] };
  const rec = new GestureRecognizer();
  opts.configure?.(rec);
  rec.beginCalibration();
  // Each rep is judged on a fixed window: from its prompt until 3 s later or the next prompt, whichever is first. The
  // live game ended a rep early on detection (and its old forward bias "detected" forward reps before the player
  // moved), so the labeled frames alone can miss the movement.
  const winLabel: (string | null)[] = data.frames.map(() => null);
  const winRep: (number | null)[] = data.frames.map(() => null);
  for (let i = 0; i < data.frames.length; i++) {
    const f = data.frames[i];
    if (!f.label || (i > 0 && data.frames[i - 1].label === f.label && data.frames[i - 1].rep === f.rep)) continue;
    const t0 = f.t;
    for (let j = i; j < data.frames.length && data.frames[j].t - t0 <= (f.label === 'still' ? 1e9 : 3); j++) {
      const g = data.frames[j];
      if (j > i && g.label && !(g.label === f.label && g.rep === f.rep)) break;
      if (f.label === 'still' && g.label !== 'still') break;
      winLabel[j] = f.label;
      winRep[j] = f.rep;
    }
  }
  const per = new Map<string, { n: number; fwd: number; strafe: number; right: number; reps: Map<number, { ok: boolean; held: number; lastT: number; got: string[] }> }>();
  for (let fi = 0; fi < data.frames.length; fi++) {
    const f = { ...data.frames[fi], label: winLabel[fi], rep: winRep[fi] };
    const p = f.people[0];
    let move: number[] = [0, 0];
    let acts: { kind: string; hand: string }[] = [];
    if (opts.recorded) {
      move = f.move ?? [0, 0];
      acts = f.actions ?? [];
    } else {
      const out = rec.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t);
      move = out.move;
      acts = out.actions;
    }
    if (!f.label) continue;
    const e = EXPECT[f.label];
    let s = per.get(f.label);
    if (!s) per.set(f.label, (s = { n: 0, fwd: 0, strafe: 0, right: 0, reps: new Map() }));
    s.n++;
    s.fwd += move[1];
    s.strafe += move[0];
    if (e?.dir) {
      const v = e.dir === 'fwd' ? move[1] : e.dir === 'back' ? -move[1] : e.dir === 'left' ? move[0] : -move[0];
      if (v > 0.1) s.right++;
    } else if (f.label === 'still' || e?.kind) if (Math.abs(move[1]) <= 0.1 && Math.abs(move[0]) <= 0.1) s.right++;
    if (e && f.rep != null) {
      let r = s.reps.get(f.rep);
      if (!r) s.reps.set(f.rep, (r = { ok: false, held: 0, lastT: f.t, got: [] }));
      const dt = Math.min(0.2, f.t - r.lastT);
      r.lastT = f.t;
      if (e.dir) {
        const v = e.dir === 'fwd' ? move[1] : e.dir === 'back' ? -move[1] : e.dir === 'left' ? move[0] : -move[0];
        r.held = v > 0.3 ? r.held + dt : 0;
        if (r.held >= 0.3) r.ok = true;
      } else {
        for (const a of acts) {
          r.got.push(a.kind + (a.hand === 'B' ? '' : a.hand));
          if (a.kind === e.kind && (!e.hand || a.hand === e.hand)) r.ok = true;
        }
      }
    }
  }
  const stats: LabelStats[] = [];
  for (const [label, s] of per) {
    const got: Record<string, number> = {};
    for (const r of s.reps.values()) for (const g of r.got) got[g] = (got[g] ?? 0) + 1;
    stats.push({ label, frames: s.n, fwd: s.fwd / s.n, strafe: s.strafe / s.n, rightSign: s.right / s.n, reps: s.reps.size, hit: [...s.reps.values()].filter((r) => r.ok).length, got, perRep: [...s.reps.entries()].map(([rep, r]) => ({ rep, ok: r.ok, got: r.got })) });
  }
  return { name: data.name, calib: rec.calib, stats };
}

export function table(r: ReturnType<typeof replay>) {
  const lines = [`session ${r.name.slice(0, 8)}  calib leanZ ${r.calib.leanZ?.toFixed(3)} imgSW ${r.calib.imgShoulderW.toFixed(3)} hipX ${r.calib.imgHipX?.toFixed(3)}`, 'label          frames   fwd    strafe  right-sign  reps  detected   actions in reps'];
  for (const s of r.stats) lines.push(`${s.label.padEnd(14)} ${String(s.frames).padStart(5)}  ${s.fwd.toFixed(2).padStart(5)}  ${s.strafe.toFixed(2).padStart(6)}   ${(s.rightSign * 100).toFixed(0).padStart(5)}%   ${String(s.reps || '-').padStart(4)}  ${s.reps ? `${s.hit}/${s.reps}` : '-'}`.padEnd(72) + Object.entries(s.got).map(([k, v]) => `${k}×${v}`).join(' '));
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const recorded = args.includes('--recorded');
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
  const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--json');
  const files = (names.length ? names : fs.readdirSync(path.join(ROOT, 'clips/research')).map((f) => f.replace('.json', ''))).map((n) => path.join(ROOT, 'clips/research', n.endsWith('.json') ? n : n + '.json'));
  const all = files.map((f) => replay(f, { recorded }));
  for (const r of all) console.log(table(r) + '\n');
  if (args.includes('--reps')) for (const r of all) for (const st of r.stats) if (st.perRep.length && st.perRep.some((x) => x.got.length || !x.ok)) console.log(r.name.slice(0, 8), st.label.padEnd(13), st.perRep.map((x) => `r${x.rep}${x.ok ? '✓' : '✗'}[${x.got.join(' ')}]`).join('  '));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(all, null, 1));
}
