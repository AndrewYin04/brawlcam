// CPU fighter. Produces the same inputs and actions as a human player.
import { TUNING, type Action, type Sim, type SimEvent } from './sim';
import { packJoints } from './joints';
import { proceduralJoints } from './animate';

export interface BotOptions {
  /** 0 = easy, 1 = normal, 2 = hard, 3 = aggressive. -1 = passive training dummy (never attacks or guards). */
  level?: number;
  seed?: number;
}

export class Bot {
  id: number;
  private nextAttackAt = 0;
  /** Hold the guard until this time (released early when the guard meter runs low, unless stubborn). */
  private blockUntil = 0;
  /** A "stubborn" hold ignores the guard meter, so the bot sometimes gets guard-broken. */
  private stubborn = false;
  /** Don't re-raise the guard before this (gives the meter time to refill). */
  private guardRestUntil = 0;
  /** Time of the last opponent attack the bot already reacted to (one decision per attack). */
  private seenAtk = new Map<number, number>();
  private nextGuardRollAt = 0;
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

  /** Decide whether to raise the guard in response to an attack, and for how long. */
  private considerGuard(sim: Sim, chance: number) {
    const me = sim.get(this.id);
    if (!me || this.level < 0 || me.dizzyUntil > 0 || sim.t < me.ironWallUntil) return;
    if (sim.t < this.guardRestUntil || sim.t < this.blockUntil) return;
    if (this.rng() >= chance) return;
    // Full super meter: sometimes answer with the Iron Wall instead (counters the next hit).
    if (me.meter >= 100 && this.rng() < 0.35) {
      sim.pushAction(this.id, { kind: 'xshield', hand: 'B', speed: 0 });
      return;
    }
    // Usually a short guard; occasionally the bot turtles far too long and gets guard-broken (more often on easy).
    this.stubborn = this.rng() < [0.22, 0.15, 0.1, 0.08][Math.max(0, Math.min(3, this.level))];
    this.blockUntil = sim.t + (this.stubborn ? 5.3 + this.rng() * 1.5 : 0.5 + this.rng() * 0.9);
  }

  /** React to events (e.g. block when an attack lands nearby). */
  observe(events: SimEvent[], sim: Sim) {
    for (const e of events) {
      if (e.type === 'hit' && e.target === this.id) {
        // Got hit (or blocked one): likely to keep / raise the guard for the follow-up.
        this.considerGuard(sim, e.blocked ? 0.35 : 0.15 + 0.12 * Math.max(0, this.level));
      }
      if (e.type === 'guard_break' && e.id === this.id) {
        this.blockUntil = 0;
        this.stubborn = false;
        this.guardRestUntil = sim.t + TUNING.guardBreakDizzy + 0.6;
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
      const want = TUNING.engageDist; // arm's length
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

      // Read nearby opponents' attacks (a fresh attack means a combo may follow): maybe raise the guard.
      for (const o of sim.fighters) {
        if (o.id === this.id || !o.alive || !o.atk || o.target !== this.id) continue;
        if (this.seenAtk.get(o.id) === o.atk.t) continue;
        this.seenAtk.set(o.id, o.atk.t);
        if (t - o.atk.t > 0.2 || Math.hypot(o.x - me.x, o.z - me.z) > TUNING.reach.kick + 0.5) continue;
        this.considerGuard(sim, 0.1 + 0.08 * Math.max(0, this.level));
      }

      // Now and then guard up proactively when in range (so guards and breaks also show up against a passive player).
      if (dist < TUNING.reach.kick + 0.3 && t >= this.nextGuardRollAt) {
        this.nextGuardRollAt = t + 0.5;
        this.considerGuard(sim, 0.04);
      }

      // Release a sensible guard before it breaks so it can refill; a stubborn one is held anyway.
      if (t < this.blockUntil && !this.stubborn && me.guard < 25) {
        this.blockUntil = t;
        this.guardRestUntil = t + 1 + this.rng();
      }
      if (t >= this.blockUntil && this.stubborn) {
        this.stubborn = false;
        this.guardRestUntil = t + 0.8;
      }
      blocking = this.level >= 0 && t < this.blockUntil && me.dizzyUntil === 0;

      // Level -1: passive training dummy (never attacks), used by tests and as an option.
      if (this.level >= 0 && t >= this.nextAttackAt && dist < TUNING.reach.jab + 0.1 && t >= me.stunUntil && me.dizzyUntil === 0) {
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
      shield: t < me.ironWallUntil,
      stunned: t < me.stunUntil || me.dizzyUntil > 0,
      t,
      seed: this.seed % 10,
    });
    sim.setInput(this.id, { move: [strafe, fwd], blocking, xshield: false, turn: 0, present: true, joints: packJoints(joints) });
  }
}
