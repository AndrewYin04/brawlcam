// Authoritative game simulation. Runs in the browser for local modes and on the server for online rooms.
// Handles any number of fighters; 1v1 is just a room with two fighters.

export type Mode = 'duel' | 'brawl';
export type ActionKind = 'jab' | 'hook' | 'uppercut' | 'kick' | 'palm' | 'xshield';
export type Hand = 'L' | 'R' | 'B';

export interface Action {
  kind: ActionKind;
  hand: Hand;
  /** Peak limb speed in m/s, used to scale damage. */
  speed: number;
}

export interface FighterInput {
  /** [strafe, forward], each -1..1. Forward means toward the current target. */
  move: [number, number];
  blocking: boolean;
  xshield: boolean;
  /** -1 or +1 to switch target to the left or right (Brawl), else 0. */
  turn: number;
  /** Is a person currently tracked for this fighter? Absent fighters idle. */
  present: boolean;
  /** Packed joints (see shared/joints.ts), cosmetic only. */
  joints?: number[];
}

export interface FighterInit {
  id: number;
  name: string;
  color: string;
  bot?: boolean;
  skin?: string;
  card?: string;
}

export interface Fighter extends FighterInit {
  bot: boolean;
  hp: number;
  meter: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  blocking: boolean;
  shieldUntil: number;
  stunUntil: number;
  invulnUntil: number;
  kb: number; // knockback percent (Brawl)
  kos: number;
  deaths: number;
  roundWins: number;
  alive: boolean;
  respawnAt: number;
  target: number | null;
  lastHitBy: number | null;
  lastHitAt: number;
  cd: Record<string, number>;
  /** Most recent attack, for rendering procedural strikes on remote/bot fighters. */
  atk: { k: ActionKind | 'super_uppercut' | 'blast'; h: Hand; t: number } | null;
  input: FighterInput;
  damageDealt: number;
  fastestPunch: number;
}

export interface Projectile {
  id: number;
  owner: number;
  target: number | null;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  ttl: number;
}

export type SimEvent =
  | { type: 'hit'; attacker: number; target: number; damage: number; kind: string; blocked: boolean; shielded: boolean; isSuper: boolean; x: number; y: number; z: number; speed: number }
  | { type: 'whiff'; attacker: number; kind: string; hand: Hand }
  | { type: 'super'; id: number; kind: 'uppercut' | 'shield' | 'blast' }
  | { type: 'super_denied'; id: number; kind: 'uppercut' | 'shield' | 'blast'; reason: 'meter' | 'cooldown' }
  | { type: 'ko'; attacker: number | null; target: number; kind: string; ringout: boolean }
  | { type: 'respawn'; id: number }
  | { type: 'round_start'; n: number }
  | { type: 'round_end'; n: number; winner: number | null; reason: 'ko' | 'time' }
  | { type: 'match_over'; winner: number | null; reason: string }
  | { type: 'fight' };

export interface SimConfig {
  mode: Mode;
  roundSeconds: number;
  roundsToWin: number;
  maxRounds: number;
  meterStart: number;
  countdownSeconds: number;
  arenaRadius: number;
  respawnSeconds: number;
}

export const DUEL_DEFAULTS: SimConfig = {
  mode: 'duel',
  roundSeconds: 60,
  roundsToWin: 2,
  maxRounds: 5,
  meterStart: 50,
  countdownSeconds: 3,
  arenaRadius: 4.2,
  respawnSeconds: 3,
};

export const BRAWL_DEFAULTS: SimConfig = {
  mode: 'brawl',
  roundSeconds: 120,
  roundsToWin: 1,
  maxRounds: 1,
  meterStart: 30,
  countdownSeconds: 3,
  arenaRadius: 6,
  respawnSeconds: 3,
};

export const TUNING = {
  hpMax: 100,
  moveSpeed: 2.4,
  engageDist: 1.3,
  minDist: 0.85,
  reach: { jab: 1.75, hook: 1.6, uppercut: 1.6, kick: 1.95, palm: 0, xshield: 0 } as Record<ActionKind, number>,
  speedMin: 1.5, // m/s, maps to 5 HP
  speedMax: 6.0, // m/s, maps to 15 HP
  blockFactor: 0.2,
  meterPerHit: 12,
  meterPerBlockedHit: 4,
  meterPerTaken: 8,
  handCooldown: 0.28,
  kickCooldown: 0.6,
  superCooldown: { uppercut: 6, shield: 10, blast: 6 },
  superUppercutDamage: 25,
  superUppercutLunge: 3.2,
  blastDamage: 20,
  blastSpeed: 9,
  shieldSeconds: 3,
  stunSeconds: 0.22,
  slowmoSuper: 1.2,
  slowmoKO: 1.6,
  slowmoScale: 0.25,
  roundEndPause: 3.5,
  gravity: 18,
};

const NO_INPUT: FighterInput = { move: [0, 0], blocking: false, xshield: false, turn: 0, present: false };

export function damageForSpeed(speed: number): number {
  const s = Math.max(0, Math.min(1, (speed - TUNING.speedMin) / (TUNING.speedMax - TUNING.speedMin)));
  return Math.round(5 + 10 * s);
}

export class Sim {
  cfg: SimConfig;
  t = 0;
  fighters: Fighter[] = [];
  projectiles: Projectile[] = [];
  phase: 'waiting' | 'countdown' | 'fight' | 'round_end' | 'match_over' = 'waiting';
  phaseUntil = 0;
  round = 0;
  roundTimer = 0;
  slowmoUntil = 0; // in real (unscaled) seconds
  realT = 0;
  winner: number | null = null;
  private events: SimEvent[] = [];
  private actions: { id: number; a: Action }[] = [];
  private nextProjectileId = 1;
  private rng: () => number;

  constructor(cfg: Partial<SimConfig> & { mode: Mode }, seed = 1) {
    const base = cfg.mode === 'brawl' ? BRAWL_DEFAULTS : DUEL_DEFAULTS;
    this.cfg = { ...base, ...cfg };
    let s = seed >>> 0 || 1;
    this.rng = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  // ---------- roster ----------

  addFighter(init: FighterInit): Fighter {
    const f: Fighter = {
      ...init,
      bot: !!init.bot,
      hp: TUNING.hpMax,
      meter: this.cfg.meterStart,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      blocking: false,
      shieldUntil: 0,
      stunUntil: 0,
      invulnUntil: 0,
      kb: 0,
      kos: 0,
      deaths: 0,
      roundWins: 0,
      alive: true,
      respawnAt: 0,
      target: null,
      lastHitBy: null,
      lastHitAt: -99,
      cd: {},
      atk: null,
      input: { ...NO_INPUT },
      damageDealt: 0,
      fastestPunch: 0,
    };
    this.fighters.push(f);
    this.placeAll();
    return f;
  }

  removeFighter(id: number) {
    this.fighters = this.fighters.filter((f) => f.id !== id);
    for (const f of this.fighters) if (f.target === id) f.target = null;
    if (this.cfg.mode === 'duel' && this.fighters.length < 2 && (this.phase === 'fight' || this.phase === 'countdown')) {
      // Opponent left mid-match: remaining fighter wins.
      const w = this.fighters[0]?.id ?? null;
      this.endMatch(w, 'opponent_left');
    }
  }

  get(id: number): Fighter | undefined {
    return this.fighters.find((f) => f.id === id);
  }

  /** Spread fighters around the ring facing the center (duel: facing each other). */
  placeAll() {
    const n = this.fighters.length;
    if (this.cfg.mode === 'duel') {
      const d = TUNING.engageDist / 2;
      this.fighters.forEach((f, i) => {
        f.x = 0;
        f.z = i === 0 ? d : -d;
        if (i > 1) f.z = 0; // extra fighters in a duel are not expected
        f.y = 0;
        f.vx = f.vy = f.vz = 0;
      });
      this.fighters.forEach((f) => this.faceTarget(f, true));
    } else {
      const r = this.cfg.arenaRadius * 0.55;
      this.fighters.forEach((f, i) => {
        const a = (i / Math.max(1, n)) * Math.PI * 2;
        f.x = Math.sin(a) * r;
        f.z = Math.cos(a) * r;
        f.y = 0;
        f.vx = f.vy = f.vz = 0;
        f.yaw = Math.atan2(-f.x, -f.z);
      });
    }
  }

  // ---------- inputs ----------

  setInput(id: number, input: Partial<FighterInput>) {
    const f = this.get(id);
    if (!f) return;
    f.input = { ...f.input, ...input };
    if (input.turn) this.switchTarget(f, input.turn);
  }

  pushAction(id: number, a: Action) {
    this.actions.push({ id, a });
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- flow ----------

  start() {
    this.round = 0;
    this.winner = null;
    for (const f of this.fighters) {
      f.roundWins = 0;
      f.kos = 0;
      f.deaths = 0;
      f.damageDealt = 0;
      f.fastestPunch = 0;
    }
    this.startRound();
  }

  private startRound() {
    this.round++;
    this.roundTimer = this.cfg.roundSeconds;
    this.projectiles = [];
    for (const f of this.fighters) {
      f.hp = TUNING.hpMax;
      f.meter = this.round === 1 ? this.cfg.meterStart : Math.max(f.meter, this.cfg.meterStart);
      f.kb = 0;
      f.alive = true;
      f.shieldUntil = 0;
      f.stunUntil = 0;
      f.invulnUntil = 0;
      f.cd = {};
      f.atk = null;
      f.lastHitBy = null;
    }
    this.placeAll();
    this.phase = 'countdown';
    this.phaseUntil = this.t + this.cfg.countdownSeconds;
    this.emit({ type: 'round_start', n: this.round });
  }

  private emit(e: SimEvent) {
    this.events.push(e);
  }

  get timeScale(): number {
    return this.realT < this.slowmoUntil ? TUNING.slowmoScale : 1;
  }

  /** Advance by dt real seconds. */
  step(realDt: number) {
    this.realT += realDt;
    const dt = realDt * this.timeScale;
    this.t += dt;

    if (this.phase === 'countdown' && this.t >= this.phaseUntil) {
      this.phase = 'fight';
      this.emit({ type: 'fight' });
    }
    if (this.phase === 'round_end' && this.t >= this.phaseUntil) {
      this.afterRound();
    }

    const fighting = this.phase === 'fight';
    const actions = this.actions;
    this.actions = [];
    if (fighting) for (const { id, a } of actions) this.resolveAction(id, a);

    for (const f of this.fighters) this.updateFighter(f, dt, fighting);
    if (fighting) this.updateProjectiles(dt);
    this.separate();

    if (fighting) {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.roundTimer = 0;
        this.timeUp();
      }
    }
  }

  private updateFighter(f: Fighter, dt: number, fighting: boolean) {
    const inp = f.input;
    // Respawn (Brawl)
    if (!f.alive) {
      if (this.cfg.mode === 'brawl' && this.t >= f.respawnAt && this.phase === 'fight') this.respawn(f);
      return;
    }
    // Airborne / knockback physics
    if (f.y > 0 || f.vy !== 0) {
      f.vy -= TUNING.gravity * dt;
      f.y += f.vy * dt;
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
      }
    }
    if (f.vx !== 0 || f.vz !== 0) {
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      const damp = Math.exp(-(f.y > 0 ? 1.5 : 6) * dt);
      f.vx *= damp;
      f.vz *= damp;
      if (Math.hypot(f.vx, f.vz) < 0.05) f.vx = f.vz = 0;
    }

    this.ensureTarget(f);
    this.faceTarget(f, false, dt);

    const stunned = this.t < f.stunUntil;
    f.blocking = fighting && inp.present && !stunned && (inp.blocking || (inp.xshield && f.meter < 100));

    const walkFromX = f.x;
    const walkFromZ = f.z;
    if (fighting && inp.present && !stunned && f.y === 0) {
      let [strafe, fwd] = inp.move;
      const tgt = f.target != null ? this.get(f.target) : undefined;
      if (tgt) {
        const dx = tgt.x - f.x;
        const dz = tgt.z - f.z;
        const dist = Math.hypot(dx, dz) || 1;
        // Duel assist: drift back to engage distance when the player is not stepping.
        if (this.cfg.mode === 'duel' && Math.abs(fwd) < 0.2) {
          const err = dist - TUNING.engageDist;
          if (Math.abs(err) > 0.08) fwd = Math.max(-0.5, Math.min(0.5, err * 1.2));
        }
        const fx = dx / dist;
        const fz = dz / dist;
        // strafe: +1 moves to the fighter's own left (counterclockwise around the target)
        const lx = fz;
        const lz = -fx;
        const sp = TUNING.moveSpeed * (f.blocking ? 0.5 : 1);
        let mx = (fx * fwd + lx * strafe) * sp * dt;
        let mz = (fz * fwd + lz * strafe) * sp * dt;
        // do not walk through the target
        if (fwd > 0 && dist - fwd * sp * dt < TUNING.minDist) {
          mx -= fx * fwd * sp * dt;
          mz -= fz * fwd * sp * dt;
        }
        f.x += mx;
        f.z += mz;
      } else {
        // No target: move in facing frame.
        const fx = Math.sin(f.yaw);
        const fz = Math.cos(f.yaw);
        f.x += (fx * fwd + fz * strafe) * TUNING.moveSpeed * dt;
        f.z += (fz * fwd - fx * strafe) * TUNING.moveSpeed * dt;
      }
    }

    // Arena bounds
    const R = this.cfg.arenaRadius;
    if (this.cfg.mode === 'brawl') {
      // Walking alone never takes you out of the ring: only knockback can (ring-outs must be earned).
      const before = Math.hypot(walkFromX, walkFromZ);
      const after = Math.hypot(f.x, f.z);
      const edge = R - 0.25;
      if (after > edge && after > before && f.vx === 0 && f.vz === 0) {
        const k = Math.max(before, edge) / after;
        f.x *= k;
        f.z *= k;
      }
    }
    const r = Math.hypot(f.x, f.z);
    if (this.cfg.mode === 'duel') {
      if (r > R) {
        f.x *= R / r;
        f.z *= R / r;
      }
    } else if (r > R + 0.3 && fighting) {
      this.kill(f, f.lastHitBy != null && this.t - f.lastHitAt < 6 ? f.lastHitBy : null, 'ringout', true);
    }
  }

  private respawn(f: Fighter) {
    f.alive = true;
    f.hp = TUNING.hpMax;
    f.kb = 0;
    f.vx = f.vy = f.vz = 0;
    f.y = 0;
    const a = this.rng() * Math.PI * 2;
    const r = this.cfg.arenaRadius * 0.5;
    f.x = Math.sin(a) * r;
    f.z = Math.cos(a) * r;
    f.invulnUntil = this.t + 1.5;
    f.lastHitBy = null;
    this.emit({ type: 'respawn', id: f.id });
  }

  private kill(f: Fighter, by: number | null, kind: string, ringout: boolean) {
    if (!f.alive) return;
    f.alive = false;
    f.hp = 0;
    f.deaths++;
    const killer = by != null ? this.get(by) : undefined;
    if (killer && killer.id !== f.id) killer.kos++;
    this.emit({ type: 'ko', attacker: killer?.id ?? null, target: f.id, kind, ringout });
    if (this.cfg.mode === 'brawl') {
      f.respawnAt = this.t + this.cfg.respawnSeconds;
    } else {
      this.slowmoUntil = this.realT + TUNING.slowmoKO;
      this.endRound(killer?.id ?? null, 'ko');
    }
  }

  // ---------- targeting ----------

  private opponents(f: Fighter): Fighter[] {
    return this.fighters.filter((o) => o.id !== f.id && o.alive);
  }

  private ensureTarget(f: Fighter) {
    const cur = f.target != null ? this.get(f.target) : undefined;
    if (cur && cur.alive) return;
    // Nearest opponent in front, else nearest overall.
    let best: Fighter | null = null;
    let bestScore = Infinity;
    for (const o of this.opponents(f)) {
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      const ang = Math.abs(wrapAngle(Math.atan2(o.x - f.x, o.z - f.z) - f.yaw));
      const score = d + (ang > 1.3 ? 3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    f.target = best?.id ?? null;
  }

  /** Switch to the next opponent to the left (+1) or right (-1) of the current facing. */
  switchTarget(f: Fighter, dir: number) {
    const opps = this.opponents(f).filter((o) => o.id !== f.target);
    if (!opps.length) return;
    let best: Fighter | null = null;
    let bestAng = Infinity;
    for (const o of opps) {
      const a = wrapAngle(Math.atan2(o.x - f.x, o.z - f.z) - f.yaw);
      // Positive yaw delta is toward the fighter's left (+X when facing +Z).
      const signed = dir > 0 ? a : -a;
      const key = signed > 0 ? signed : signed + Math.PI * 2;
      if (key < bestAng) {
        bestAng = key;
        best = o;
      }
    }
    if (best) f.target = best.id;
  }

  private faceTarget(f: Fighter, snap: boolean, dt = 0) {
    const t = f.target != null ? this.get(f.target) : undefined;
    if (!t) return;
    const want = Math.atan2(t.x - f.x, t.z - f.z);
    if (snap) {
      f.yaw = want;
      return;
    }
    const d = wrapAngle(want - f.yaw);
    const maxTurn = 7 * dt;
    f.yaw = wrapAngle(f.yaw + Math.max(-maxTurn, Math.min(maxTurn, d)));
  }

  // ---------- combat ----------

  private resolveAction(id: number, a: Action) {
    const f = this.get(id);
    if (!f || !f.alive || !f.input.present) return;
    if (this.t < f.stunUntil) return;

    if (a.kind === 'palm') return this.trySuper(f, 'blast');
    if (a.kind === 'xshield') {
      // With a full meter the X is the Shield super; otherwise it is just a block (handled by input state).
      if (f.meter >= 100) this.trySuper(f, 'shield');
      return;
    }
    if (a.kind === 'uppercut' && f.meter >= 100 && this.cdReady(f, 'uppercut')) return this.trySuper(f, 'uppercut');

    const cdKey = a.kind === 'kick' ? 'kick' : 'hand' + a.hand;
    if (!this.cdReady(f, cdKey)) return;
    f.cd[cdKey] = this.t + (a.kind === 'kick' ? TUNING.kickCooldown : TUNING.handCooldown);
    f.atk = { k: a.kind, h: a.hand, t: this.t };
    f.fastestPunch = Math.max(f.fastestPunch, a.speed);

    const tgt = this.strikeTarget(f, TUNING.reach[a.kind]);
    if (!tgt) {
      this.emit({ type: 'whiff', attacker: f.id, kind: a.kind, hand: a.hand });
      return;
    }
    let dmg = damageForSpeed(a.speed);
    if (a.kind === 'hook') dmg = Math.round(dmg * 1.1);
    if (a.kind === 'uppercut') dmg += 1;
    if (a.kind === 'kick') dmg = Math.round(12 + 6 * Math.max(0, Math.min(1, (a.speed - TUNING.speedMin) / (TUNING.speedMax - TUNING.speedMin))));
    this.applyHit(f, tgt, dmg, a.kind, false, a.speed);
  }

  /** Closest opponent within reach and in front of the attacker (target lock preferred). */
  private strikeTarget(f: Fighter, reach: number): Fighter | null {
    const cand: Fighter[] = [];
    const locked = f.target != null ? this.get(f.target) : undefined;
    if (locked) cand.push(locked);
    for (const o of this.opponents(f)) if (o !== locked) cand.push(o);
    for (const o of cand) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (d > reach) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(o.x - f.x, o.z - f.z) - f.yaw));
      if (ang > 1.1) continue;
      return o;
    }
    return null;
  }

  private cdReady(f: Fighter, key: string) {
    return (f.cd[key] ?? 0) <= this.t;
  }

  private trySuper(f: Fighter, kind: 'uppercut' | 'shield' | 'blast') {
    if (f.meter < 100) {
      this.emit({ type: 'super_denied', id: f.id, kind, reason: 'meter' });
      return;
    }
    if (!this.cdReady(f, kind)) {
      this.emit({ type: 'super_denied', id: f.id, kind, reason: 'cooldown' });
      return;
    }
    f.meter = 0;
    f.cd[kind] = this.t + TUNING.superCooldown[kind];
    this.emit({ type: 'super', id: f.id, kind });
    if (kind === 'shield') {
      f.shieldUntil = this.t + TUNING.shieldSeconds;
      return;
    }
    if (kind === 'blast') {
      f.atk = { k: 'blast', h: 'B', t: this.t };
      const tgt = f.target != null ? this.get(f.target) : undefined;
      const dirx = tgt ? tgt.x - f.x : Math.sin(f.yaw);
      const dirz = tgt ? tgt.z - f.z : Math.cos(f.yaw);
      const len = Math.hypot(dirx, dirz) || 1;
      this.projectiles.push({
        id: this.nextProjectileId++,
        owner: f.id,
        target: tgt?.id ?? null,
        x: f.x + (dirx / len) * 0.5,
        y: 1.25,
        z: f.z + (dirz / len) * 0.5,
        vx: (dirx / len) * TUNING.blastSpeed,
        vz: (dirz / len) * TUNING.blastSpeed,
        ttl: 2.5,
      });
      return;
    }
    // Super uppercut: lunge to the target if close enough, then launch.
    f.atk = { k: 'super_uppercut', h: 'R', t: this.t };
    const tgt = this.strikeTarget(f, TUNING.superUppercutLunge);
    this.slowmoUntil = this.realT + TUNING.slowmoSuper;
    if (!tgt) {
      this.emit({ type: 'whiff', attacker: f.id, kind: 'super_uppercut', hand: 'R' });
      return;
    }
    const d = Math.hypot(tgt.x - f.x, tgt.z - f.z);
    if (d > TUNING.engageDist) {
      const k = (d - TUNING.engageDist * 0.8) / d;
      f.x += (tgt.x - f.x) * k;
      f.z += (tgt.z - f.z) * k;
    }
    this.applyHit(f, tgt, TUNING.superUppercutDamage, 'super_uppercut', true, 0);
  }

  private applyHit(att: Fighter, tgt: Fighter, base: number, kind: string, isSuper: boolean, speed: number) {
    if (this.t < tgt.invulnUntil) return;
    const shielded = this.t < tgt.shieldUntil;
    // Super uppercut breaks a normal block; only the Shield stops it.
    const blocked = !shielded && tgt.blocking && kind !== 'super_uppercut';
    let dmg = shielded ? 0 : blocked ? Math.max(1, Math.round(base * TUNING.blockFactor)) : base;
    dmg = Math.min(dmg, tgt.hp);
    tgt.hp -= dmg;
    att.damageDealt += dmg;
    if (!shielded) {
      att.meter = Math.min(100, att.meter + (blocked ? TUNING.meterPerBlockedHit : TUNING.meterPerHit));
      tgt.meter = Math.min(100, tgt.meter + TUNING.meterPerTaken * (blocked ? 0.5 : 1));
    }
    tgt.lastHitBy = att.id;
    tgt.lastHitAt = this.t;
    if (!blocked && !shielded) tgt.stunUntil = this.t + TUNING.stunSeconds;

    // Knockback
    const dx = tgt.x - att.x;
    const dz = tgt.z - att.z;
    const len = Math.hypot(dx, dz) || 1;
    if (this.cfg.mode === 'brawl') {
      if (!shielded) tgt.kb += dmg;
      const power = (blocked || shielded ? 0.6 : 2.2) * (1 + tgt.kb / 45) * (isSuper ? 2.2 : 1);
      tgt.vx += (dx / len) * power;
      tgt.vz += (dz / len) * power;
      if (kind === 'super_uppercut' && !shielded) tgt.vy = 7 + tgt.kb / 30;
      else if (!blocked && !shielded && tgt.kb > 60) tgt.vy = Math.max(tgt.vy, 2 + tgt.kb / 60);
    } else {
      const push = shielded ? 0.4 : blocked ? 0.6 : 1.6;
      tgt.vx += (dx / len) * push;
      tgt.vz += (dz / len) * push;
      if (kind === 'super_uppercut' && !shielded) tgt.vy = 7.5;
    }

    this.emit({
      type: 'hit',
      attacker: att.id,
      target: tgt.id,
      damage: dmg,
      kind,
      blocked,
      shielded,
      isSuper,
      x: tgt.x,
      y: 1.35 + tgt.y,
      z: tgt.z,
      speed,
    });
    if (tgt.hp <= 0) this.kill(tgt, att.id, kind, false);
  }

  private updateProjectiles(dt: number) {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.ttl -= dt;
      // gentle homing
      const tgt = p.target != null ? this.get(p.target) : undefined;
      if (tgt && tgt.alive) {
        const dx = tgt.x - p.x;
        const dz = tgt.z - p.z;
        const len = Math.hypot(dx, dz) || 1;
        const sp = Math.hypot(p.vx, p.vz);
        p.vx += ((dx / len) * sp - p.vx) * Math.min(1, 2.5 * dt);
        p.vz += ((dz / len) * sp - p.vz) * Math.min(1, 2.5 * dt);
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      let hit = false;
      for (const o of this.fighters) {
        if (o.id === p.owner || !o.alive) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < 0.55) {
          const owner = this.get(p.owner);
          if (owner) this.applyHit(owner, o, TUNING.blastDamage, 'blast', true, 0);
          hit = true;
          break;
        }
      }
      if (!hit && p.ttl > 0 && Math.hypot(p.x, p.z) < this.cfg.arenaRadius + 4) keep.push(p);
    }
    this.projectiles = keep;
  }

  /** Keep fighters from overlapping. */
  private separate() {
    const fs = this.fighters.filter((f) => f.alive);
    for (let i = 0; i < fs.length; i++)
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i];
        const b = fs[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < TUNING.minDist && d > 1e-6) {
          const push = (TUNING.minDist - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        } else if (d <= 1e-6) {
          b.x += 0.1;
        }
      }
  }

  // ---------- rounds ----------

  private timeUp() {
    if (this.cfg.mode === 'brawl') {
      const best = Math.max(...this.fighters.map((f) => f.kos));
      const top = this.fighters.filter((f) => f.kos === best);
      // Tie-break on fewer deaths, then damage dealt.
      top.sort((a, b) => a.deaths - b.deaths || b.damageDealt - a.damageDealt);
      const w = top.length === 1 || top[0].deaths !== top[1].deaths || top[0].damageDealt !== top[1].damageDealt ? top[0].id : null;
      this.endMatch(w, 'time');
      return;
    }
    const alive = this.fighters.filter((f) => f.alive);
    alive.sort((a, b) => b.hp - a.hp);
    const w = alive.length >= 2 && alive[0].hp === alive[1].hp ? null : alive[0]?.id ?? null;
    this.endRound(w, 'time');
  }

  private endRound(winner: number | null, reason: 'ko' | 'time') {
    if (this.phase !== 'fight') return;
    if (winner != null) {
      const w = this.get(winner);
      if (w) w.roundWins++;
    }
    this.phase = 'round_end';
    this.phaseUntil = this.t + TUNING.roundEndPause;
    this.emit({ type: 'round_end', n: this.round, winner, reason });
  }

  private afterRound() {
    const champ = this.fighters.find((f) => f.roundWins >= this.cfg.roundsToWin);
    if (champ) return this.endMatch(champ.id, 'rounds');
    if (this.round >= this.cfg.maxRounds) {
      const sorted = [...this.fighters].sort((a, b) => b.roundWins - a.roundWins);
      const w = sorted.length >= 2 && sorted[0].roundWins === sorted[1].roundWins ? null : sorted[0]?.id ?? null;
      return this.endMatch(w, 'max_rounds');
    }
    this.startRound();
  }

  endMatch(winner: number | null, reason: string) {
    if (this.phase === 'match_over') return;
    this.phase = 'match_over';
    this.winner = winner;
    this.emit({ type: 'match_over', winner, reason });
  }

  // ---------- wire ----------

  snapshot(includeJoints = true) {
    return {
      t: +this.t.toFixed(3),
      phase: this.phase,
      phaseLeft: +Math.max(0, this.phaseUntil - this.t).toFixed(2),
      round: this.round,
      timer: +this.roundTimer.toFixed(2),
      slow: this.timeScale < 1 ? 1 : 0,
      winner: this.winner,
      f: this.fighters.map((f) => ({
        id: f.id,
        name: f.name,
        color: f.color,
        bot: f.bot ? 1 : 0,
        skin: f.skin,
        hp: f.hp,
        meter: Math.round(f.meter),
        x: +f.x.toFixed(3),
        y: +f.y.toFixed(3),
        z: +f.z.toFixed(3),
        yaw: +f.yaw.toFixed(3),
        b: f.blocking ? 1 : 0,
        sh: +Math.max(0, f.shieldUntil - this.t).toFixed(2),
        kb: Math.round(f.kb),
        kos: f.kos,
        deaths: f.deaths,
        rw: f.roundWins,
        alive: f.alive ? 1 : 0,
        tg: f.target,
        pr: f.input.present ? 1 : 0,
        atk: f.atk ? { k: f.atk.k, h: f.atk.h, age: +(this.t - f.atk.t).toFixed(3) } : null,
        cd: {
          uppercut: +Math.max(0, (f.cd.uppercut ?? 0) - this.t).toFixed(1),
          shield: +Math.max(0, (f.cd.shield ?? 0) - this.t).toFixed(1),
          blast: +Math.max(0, (f.cd.blast ?? 0) - this.t).toFixed(1),
        },
        j: includeJoints ? f.input.joints : undefined,
      })),
      p: this.projectiles.map((p) => ({ id: p.id, o: p.owner, x: +p.x.toFixed(2), y: p.y, z: +p.z.toFixed(2) })),
    };
  }
}

export type Snapshot = ReturnType<Sim['snapshot']>;
export type FighterSnap = Snapshot['f'][number];

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
