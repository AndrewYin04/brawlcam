// CPU fighter. Produces the same inputs and actions as a human player.
import type { Action, Sim, SimEvent } from './sim';
import { packJoints } from './joints';
import { proceduralJoints } from './animate';

export interface BotOptions {
  /** 0 = easy, 1 = normal, 2 = hard */
  level?: number;
  seed?: number;
}

export class Bot {
  id: number;
  private nextAttackAt = 0;
  private blockUntil = 0;
  private strafeDir = 1;
  private strafeUntil = 0;
  private rng: () => number;
  private level: number;
  private seed: number;

  constructor(id: number, opts: BotOptions = {}) {
    this.id = id;
    this.level = opts.level ?? 1;
    this.seed = opts.seed ?? id * 7919;
    let s = this.seed >>> 0 || 1;
    this.rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** React to events (e.g. block when an attack lands nearby). */
  observe(events: SimEvent[], sim: Sim) {
    for (const e of events) {
      if (e.type === 'hit' && e.target === this.id && !e.blocked && this.rng() < 0.25 + 0.15 * this.level) {
        this.blockUntil = sim.t + 0.5 + this.rng() * 0.6;
      }
      if (e.type === 'whiff' && this.rng() < 0.2) {
        this.nextAttackAt = Math.min(this.nextAttackAt, sim.t + 0.15);
      }
    }
  }

  tick(sim: Sim) {
    const me = sim.get(this.id);
    if (!me) return;
    const tgt = me.target != null ? sim.get(me.target) : undefined;
    const t = sim.t;
    const fighting = sim.phase === 'fight';
    let fwd = 0;
    let strafe = 0;
    let blocking = false;

    if (fighting && me.alive && tgt) {
      const dist = Math.hypot(tgt.x - me.x, tgt.z - me.z);
      const want = sim.cfg.mode === 'brawl' ? 1.25 : 1.3;
      if (dist > want + 0.15) fwd = Math.min(1, (dist - want) * 1.5);
      else if (dist < want - 0.25) fwd = -0.5;
      if (sim.cfg.mode === 'brawl') {
        if (t > this.strafeUntil) {
          this.strafeDir = this.rng() < 0.5 ? -1 : 1;
          this.strafeUntil = t + 1 + this.rng() * 2;
        }
        strafe = this.strafeDir * 0.4;
        // Stay away from the ring edge.
        const r = Math.hypot(me.x, me.z);
        if (r > sim.cfg.arenaRadius * 0.8) fwd = Math.max(fwd, 0.6);
      }
      blocking = this.level >= 0 && t < this.blockUntil;

      // Level -1: passive training dummy (never attacks), used by tests and as an option.
      if (this.level >= 0 && t >= this.nextAttackAt && dist < 2.2 && t >= me.stunUntil) {
        const roll = this.rng();
        let a: Action;
        if (me.meter >= 100 && roll < 0.45) {
          a = this.rng() < 0.5 ? { kind: 'uppercut', hand: 'R', speed: 5 } : { kind: 'palm', hand: 'B', speed: 3 };
        } else if (me.meter >= 100 && roll < 0.55) {
          a = { kind: 'xshield', hand: 'B', speed: 0 };
        } else if (roll < 0.55) a = { kind: 'jab', hand: this.rng() < 0.6 ? 'L' : 'R', speed: 2 + this.rng() * 2.5 };
        else if (roll < 0.8) a = { kind: 'hook', hand: this.rng() < 0.5 ? 'L' : 'R', speed: 2 + this.rng() * 2.5 };
        else if (roll < 0.92) a = { kind: 'uppercut', hand: 'R', speed: 2.5 + this.rng() * 2 };
        else a = { kind: 'kick', hand: 'R', speed: 3 + this.rng() * 2 };
        if (!blocking) sim.pushAction(this.id, a);
        const base = [1.6, 1.15, 0.8, 0.35][Math.max(0, Math.min(3, this.level))];
        this.nextAttackAt = t + base * (0.6 + this.rng() * 0.9);
      }
    }

    const atk = me.atk ? { k: me.atk.k, h: me.atk.h, age: t - me.atk.t } : null;
    const joints = proceduralJoints({
      atk,
      blocking,
      shield: t < me.shieldUntil,
      stunned: t < me.stunUntil,
      t,
      seed: this.seed % 10,
    });
    sim.setInput(this.id, { move: [strafe, fwd], blocking, xshield: false, turn: 0, present: true, joints: packJoints(joints) });
  }
}
