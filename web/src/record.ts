// Record mode (?record): deterministic, frame-by-frame rendering for the demo video.
// Fighters are driven by saved pose landmarks (numbers only; no camera footage is ever shown),
// the real simulation and renderer run on a virtual 30 fps clock, and the page is captured per frame.
import { MatchView } from './game/view';
import { LocalSession } from './game/session';
import { GestureRecognizer, type GestureOutput, type LM } from '../../shared/gestures';
import { proceduralJoints } from '../../shared/animate';
import { arenaRef, show, hooks } from './main';
import type { Joints } from '../../shared/joints';
import type { Action } from '../../shared/sim';

interface Replay {
  frames: { t: number; people: { image: LM[]; world: LM[] }[] }[];
  rec: GestureRecognizer;
  offset: number;
}

interface SceneCfg {
  mode: 'duel' | 'brawl';
  camera: 'behind' | 'side' | 'wide';
  players: { name: string; color: string; landmarks?: string; offset?: number }[];
  bots?: number;
  botLevel?: number;
  meter?: number;
  roundSeconds?: number;
  hud?: boolean;
}

let view: MatchView | null = null;
let session: LocalSession | null = null;
let replays: (Replay | null)[] = [];
let t = 0;
const overrides = new Map<number, { kind: string; until: number; start: number; hand: string }>();
const lastOut: GestureOutput[] = [];

async function loadReplay(url: string, offset: number): Promise<Replay> {
  const data = await (await fetch(url)).json();
  const rec = new GestureRecognizer();
  // Calibrate from the clip (median body size), like the evaluation tool.
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
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
  rec.skipCalibration({ shoulderW: med(sw), armLen: Math.max(0.4, med(arm)), imgShoulderW: med(isw) });
  return { frames: data.frames, rec, offset };
}

export async function initRecord() {
  document.body.classList.add('clean');
  (window as any).__rec = {
    async scene(cfg: SceneCfg) {
      view?.dispose();
      session = new LocalSession(cfg.mode, cfg.players.map((p) => ({ name: p.name, color: p.color })), cfg.bots ?? 0, cfg.botLevel ?? 1, [], {
        ...(cfg.meter != null ? { meterStart: cfg.meter } : {}),
        ...(cfg.roundSeconds ? { roundSeconds: cfg.roundSeconds } : {}),
      });
      replays = await Promise.all(cfg.players.map((p) => (p.landmarks ? loadReplay(p.landmarks, p.offset ?? 0) : Promise.resolve(null))));
      const ids = session.localIds;
      view = new MatchView(arenaRef(), {
        localIds: ids,
        localJoints: (id) => {
          const i = ids.indexOf(id);
          const o = overrides.get(i);
          if (o && t < o.until) return proceduralJoints({ atk: { k: o.kind, h: o.hand, age: t - o.start }, blocking: false, shield: o.kind === 'xshield', t, seed: i });
          return lastOut[i]?.joints ?? null;
        },
        camera: cfg.camera,
      });
      show('game');
      document.getElementById('hud')!.classList.toggle('hidden', cfg.hud === false);
      session.start();
      t = 0;
      // Let the avatars load.
      await Promise.all([...view.slots.values()].map((s) => s.avatar.ready));
      return { ids };
    },
    /** Advance n frames of 1/30 s. */
    step(n = 1) {
      const dt = 1 / 30;
      for (let k = 0; k < n; k++) {
        t += dt;
        replays.forEach((r, i) => {
          if (!r || !session) return;
          const idx = Math.floor((t + r.offset) * 30) % r.frames.length;
          const fr = r.frames[idx];
          const p = fr.people[0];
          const out = r.rec.update(p ? { t: t, world: p.world, image: p.image } : null, t);
          lastOut[i] = out;
          session.input(i, out, out.actions);
        });
        if (!session || !view) continue;
        const res = session.tick(dt);
        if (res) {
          view.setSnapshot(res.snap);
          view.handleEvents(res.events);
          hooks.snapshot = res.snap;
          for (const e of res.events) hooks.events.push({ t: t * 1000, ...e } as any);
        }
        view.frame(dt);
        // Advance CSS animations (damage numbers, banners) by virtual time too.
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = ((a.currentTime as number) ?? 0) + dt * 1000;
        }
      }
      return { t, phase: hooks.snapshot ? (hooks.snapshot as any).phase : null };
    },
    /** Scripted move for player i (used for the slow-motion super shots). */
    move(i: number, kind: Action['kind'], hand: 'L' | 'R' | 'B' = 'R') {
      if (!session) return;
      const id = session.localIds[i];
      session.sim.pushAction(id, { kind, hand, speed: 6 });
      overrides.set(i, { kind: kind === 'palm' ? 'blast' : kind === 'uppercut' ? 'super_uppercut' : kind, hand, start: t, until: t + (kind === 'uppercut' ? 1.2 : 0.6) });
    },
    setMeter(i: number, v: number) {
      const f = session?.sim.get(session.localIds[i]);
      if (f) f.meter = v;
    },
    setHp(id: number, v: number) {
      const f = session?.sim.get(id);
      if (f) f.hp = v;
    },
    state() {
      return { t, snap: hooks.snapshot };
    },
  };
  hooks.screen = 'record';
}

export type { Joints };
