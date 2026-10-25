// Gesture debug overlay (?debug=1, REVIEW.md 4:13 AM): what the detector sees, live, in a corner, so "it doesn't work"
// becomes a specific failing step. Read-only: per arm extension / elbow angle / wrist speed, movement input, the
// grab reach-and-pull state, the last detected actions, and grab cancels from the game.
import type { PoseInput } from './input/players';

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
      if (recent.length > 5) recent.length = 5;
    }
    seenEvents = ev.length;
    const lines = [
      `pose ${pose.tracker.fps} fps · ${o?.present ? 'tracking' : 'no person'}`,
      `L  ext ${fmt((dbg.lExt ?? 0) * 100, 0)}%  elbow ${fmt(dbg.lEl, 0)}°  speed ${fmt(dbg.lSp)} m/s`,
      `R  ext ${fmt((dbg.rExt ?? 0) * 100, 0)}%  elbow ${fmt(dbg.rEl, 0)}°  speed ${fmt(dbg.rSp)} m/s`,
      `move  strafe ${fmt(o?.move?.[0])}  fwd ${fmt(o?.move?.[1])}  ${o?.blocking ? 'GUARD' : ''}${o?.xshield ? ' X' : ''}`,
      reach,
      ...recent,
    ];
    el.textContent = lines.join('\n');
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
