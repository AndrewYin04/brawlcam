// Gesture debug overlay (?debug=1, REVIEW.md 4:13 AM): what the detector sees, live, in a corner, so "it doesn't work"
// becomes a specific failing step. Read-only: per arm extension / elbow angle / wrist speed, movement input, the
// grab reach-and-pull state, the last detected actions, and grab cancels from the game.
import type { PoseInput } from './input/players';

/**
 * The Shoulder Throw's stages as the detector sees them (REVIEW.md 7:05 AM: "show the throw stage in the overlay"),
 * e.g. "throw: reach ✓ → turn 64°/60° ✓ → hinge 0.18/0.15 ✓ → THROW", or which stage is missing. `g` is the
 * recognizer's GrappleDetector (read-only: its current reach, the latest features and its config).
 */
export function throwStageLine(g: any): string {
  const r = g?.reach as { t: number; yaw: number; shH: number; torso: number; thrown: boolean } | null | undefined;
  const f = g?.last as { t: number; yaw: number; shH: number } | null | undefined;
  const c = g?.cfg ?? {};
  if (!f) return 'throw: no pose yet';
  const deg = 180 / Math.PI;
  const cool = f.t - (g.lastThrow ?? -9) < (c.throwRefractory ?? 1.2);
  if (!r || f.t - r.t > (c.throwWindow ?? 0.8)) return `throw: reach ✗ (both arms out together first)${cool ? ' · cooldown' : ''}`;
  if (Math.abs(r.yaw) * deg > (c.throwSquareDeg ?? 40)) return `throw: reach ✓ but not squared up (${(Math.abs(r.yaw) * deg).toFixed(0)}° > ${c.throwSquareDeg ?? 40}°)`;
  let d = f.yaw - r.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const turn = Math.abs(d) * deg;
  const hinge = (r.shH - f.shH) / Math.max(0.2, r.torso);
  const tOk = turn >= (c.throwTwistDeg ?? 60);
  const hOk = hinge >= (c.throwDrop ?? 0.15);
  const end = r.thrown ? ' → THROW' : cool ? ' · cooldown' : ` · ${Math.max(0, (c.throwWindow ?? 0.8) - (f.t - r.t)).toFixed(2)}s`;
  return `throw: reach ✓ → turn ${turn.toFixed(0)}/${c.throwTwistDeg ?? 60}° ${tOk ? '✓' : '✗'} → hinge ${hinge.toFixed(2)}/${(c.throwDrop ?? 0.15).toFixed(2)} ${hOk ? '✓' : '✗'}${end}`;
}

export function startDebugOverlay(pose: PoseInput, events: () => { type: string; [k: string]: unknown }[]) {
  const el = document.createElement('div');
  el.id = 'debug-overlay';
  document.body.appendChild(el);
  const recent: string[] = [];
  let seenEvents = 0;
  const t0 = performance.now();
  pose.onRaw = ((prev) => (t: number, people: any[], outs: any[]) => {
    prev?.(t, people, outs);
    for (const a of outs[0]?.actions ?? []) {
      recent.unshift(`${((performance.now() - t0) / 1000).toFixed(1)}s ${a.kind} ${a.hand}`);
      if (recent.length > 5) recent.pop();
    }
  })(pose.onRaw);
  const fmt = (v: unknown, d = 2) => (typeof v === 'number' ? v.toFixed(d) : '-');
  // A detected throw's line stays up for 2 s, so it can be read after the move.
  let thrownLine = '';
  let thrownUntil = 0;
  const throwLine = () => {
    const line = throwStageLine((pose.recognizers[0] as any)?.grapple);
    const now = performance.now();
    if (line.endsWith('→ THROW')) (thrownLine = line), (thrownUntil = now + 2000);
    return now < thrownUntil ? thrownLine : line;
  };
  const tick = () => {
    const o = pose.latest[0];
    const dbg = (o?.debug ?? {}) as Record<string, number>;
    const rec = pose.recognizers[0] as any;
    const r = rec?.grapple?.reach as { t: number; pulled: boolean; releasedAt: number } | null | undefined;
    const cfg = rec?.grapple?.cfg ?? {};
    const now = (o as any)?.joints ? (rec?.hist?.[rec.hist.length - 1]?.t ?? 0) : 0;
    let reach = 'reach: none';
    if (r) {
      const age = now - r.t;
      reach = r.releasedAt >= 0 ? `reach L ✓ R ✓ → pulling (${Math.max(0, (cfg.pullWindow ?? 0.5) - (now - r.releasedAt)).toFixed(2)} s left)` : age > (cfg.reachMaxHold ?? 0.5) ? 'arms held >0.5 s → blast, not a grab' : `reach L ✓ R ✓ → waiting for pull (${Math.max(0, (cfg.reachMaxHold ?? 0.5) - age).toFixed(2)} s left)`;
    }
    const ev = events();
    for (const e of ev.slice(seenEvents)) {
      if (e.type === 'grab_cancel') recent.unshift(`grab cancelled: ${e.reason}`);
      if (e.type === 'whiff' && (e.kind === 'grab' || e.kind === 'throw')) recent.unshift(`${e.kind}: target out of range or on cooldown`);
      if (e.type === 'clinch_start') recent.unshift('CLINCH');
      // Shoulder Throw outcomes from the game (the gesture fired, but the game said no, or it landed).
      if (e.type === 'super_denied' && e.kind === 'throw') recent.unshift(e.reason === 'meter' ? 'THROW: meter not full' : 'THROW: super cooldown');
      if (e.type === 'super' && e.kind === 'throw') recent.unshift('THROW started');
      if (e.type === 'throw') recent.unshift('THROW landed');
      if (e.type === 'grab_cancel' && e.k === 't') recent.unshift(`THROW cancelled: ${e.reason}`);
      if (recent.length > 5) recent.length = 5;
    }
    seenEvents = ev.length;
    const lines = [
      `pose ${pose.tracker.fps} fps · ${o?.present ? 'tracking' : 'no person'}`,
      `L  ext ${fmt((dbg.lExt ?? 0) * 100, 0)}%  elbow ${fmt(dbg.lEl, 0)}°  speed ${fmt(dbg.lSp)} m/s`,
      `R  ext ${fmt((dbg.rExt ?? 0) * 100, 0)}%  elbow ${fmt(dbg.rEl, 0)}°  speed ${fmt(dbg.rSp)} m/s`,
      `move  strafe ${fmt(o?.move?.[0])}  fwd ${fmt(o?.move?.[1])}  ${o?.blocking ? 'GUARD' : ''}${o?.xshield ? ' X' : ''}`,
      reach,
      throwLine(),
      ...recent,
    ];
    el.textContent = lines.join('\n');
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
