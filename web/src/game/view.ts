// Renders a match from simulation snapshots and events, for local and online sessions alike.
import * as THREE from 'three';
import { Arena } from './arena';
import { FighterAvatar } from './avatar';
import { HeroFighter, HERO_MODELS } from './hero';
import { apothem } from './stage';
import { Announcer } from './announcer';

/** New Smash-style heroes by default; the original VRM renderer stays behind ?classic (and capsules behind ?lowgfx). */
/** 1v1 camera: 'behind' (default) or 'inside' (clamped inside the cage), for the user to compare. */
export const CAM_MODE: 'behind' | 'inside' | 'free' = (() => {
  const c = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cam') : null;
  return c === 'inside' ? 'inside' : c === 'free' ? 'free' : 'behind';
})();
export const USE_HEROES = typeof location !== 'undefined' && !new URLSearchParams(location.search).has('classic') && !FighterAvatar.lowGfx;
import { VFX, SPRITE_SPARKS } from './vfx';
import * as sfx from './audio';
import { unpackJoints, type Joints } from '../../../shared/joints';
import { proceduralJoints } from '../../../shared/animate';
import type { Snapshot, FighterSnap, SimEvent } from '../../../shared/sim';

export interface ViewOptions {
  /** Fighter ids controlled on this device (camera follows the first). */
  localIds: number[];
  /** Live joints for local fighters (zero latency); falls back to snapshot joints. */
  localJoints: (id: number) => Joints | null;
  /** 'behind' = over-the-shoulder 1v1, 'side' = both fighters side-on, 'wide' = three-quarter arena view. */
  camera: 'behind' | 'side' | 'wide';
}

interface Slot {
  avatar: FighterAvatar | HeroFighter;
  pos: THREE.Vector3;
  yaw: number;
  lastHp: number;
  snap: FighterSnap;
}

const $ = (id: string) => document.getElementById(id)!;

export class MatchView {
  arena: Arena;
  vfx: VFX;
  slots = new Map<number, Slot>();
  snap: Snapshot | null = null;
  opts: ViewOptions;
  time = 0;
  private bannerTimer: number | undefined;
  private lastCountdown = -1;
  private hintTimer: number | undefined;
  private slowmoUntil = 0;
  private hitStopUntil = 0;
  private pendingHits: { at: number; e: SimEvent }[] = [];
  announcer = new Announcer();
  /** Set by the app while calibration/the tutorial runs. */
  calibrating = false;
  private fallCamUntil = 0;
  private fallTarget: number | null = null;
  private koFeed: HTMLElement;
  onEvent: ((e: SimEvent) => void) | null = null;

  constructor(arena: Arena, opts: ViewOptions) {
    this.arena = arena;
    this.opts = opts;
    this.vfx = new VFX(arena.scene, arena.camera, $('fx-layer'));
    SPRITE_SPARKS.on = USE_HEROES;
    document.body.classList.toggle('heroes', USE_HEROES);
    this.koFeed = $('kofeed');
  }

  name(id: number | null | undefined) {
    if (id == null) return '';
    return this.slots.get(id)?.snap.name ?? this.snap?.f.find((f) => f.id === id)?.name ?? 'Fighter';
  }

  color(id: number) {
    return this.slots.get(id)?.snap.color ?? '#ffffff';
  }

  private ensureSlots(s: Snapshot) {
    const ids = new Set(s.f.map((f) => f.id));
    for (const [id, slot] of this.slots)
      if (!ids.has(id)) {
        slot.avatar.dispose();
        this.slots.delete(id);
      }
    for (const f of s.f) {
      let slot = this.slots.get(f.id);
      if (!slot) {
        const avatar = USE_HEROES && !FighterAvatar.lowGfx ? new HeroFighter({ color: f.color }, HERO_MODELS[(f.id - 1) % HERO_MODELS.length]) : new FighterAvatar({ color: f.color });
        this.arena.scene.add(avatar.root);
        slot = { avatar, pos: new THREE.Vector3(f.x, 0, f.z), yaw: f.yaw, lastHp: f.hp, snap: f };
        this.slots.set(f.id, slot);
      }
      if (slot.snap.color !== f.color) slot.avatar.applyStyle({ color: f.color });
      slot.snap = f;
    }
  }

  setSnapshot(s: Snapshot) {
    this.snap = s;
    this.ensureSlots(s);
  }

  handleEvents(events: SimEvent[]) {
    for (const e of events) {
      this.onEvent?.(e);
      // Announcer for everything except hits and KOs (those are announced when they land on screen, below).
      if (e.type !== 'hit' && e.type !== 'ko') this.announcer.onEvent(e, this.snap);
      switch (e.type) {
        case 'hit': {
          // Hero renderer: the strike animation reaches the target a moment after the sim registers the hit;
          // start the strike now (aimed at the target) and play the impact on the contact frame.
          const attS = this.slots.get(e.attacker);
          const tgtS = this.slots.get(e.target);
          if (attS?.avatar instanceof HeroFighter && tgtS?.avatar instanceof HeroFighter && !(e as any).__delayed) {
            const af = this.snap?.f.find((x) => x.id === e.attacker);
            if (af?.atk && this.snap) attS.avatar.attack(af.atk.k, af.atk.h, `${af.atk.k}${af.atk.h}${(this.snap.t - af.atk.age).toFixed(2)}`, tgtS.avatar);
            const delay = Math.min(0.35, attS.avatar.contactDelay());
            if (delay > 0.005) {
              this.pendingHits.push({ at: this.time + delay, e: { ...e, __delayed: true } as SimEvent });
              break;
            }
          }
          this.announcer.onEvent(e, this.snap);
          const tgt = this.slots.get(e.target);
          const att = this.slots.get(e.attacker);
          if (att?.avatar instanceof HeroFighter) {
            // Spark at the fist (contact point), not where the sim guessed.
            const cp = att.avatar.contactPoint();
            (e as any).x = cp.x;
            (e as any).y = cp.y;
            (e as any).z = cp.z;
          }
          const pos = new THREE.Vector3(e.x, e.y, e.z);
          const col = att ? att.snap.color : '#fff';
          this.vfx.hit(pos, col, e.damage, e.blocked, e.shielded, e.isSuper);
          if (tgt && att) {
            const dir = tgt.pos.clone().sub(att.pos);
            tgt.avatar.flinchFrom(dir, e.blocked || e.shielded ? 0.3 : e.isSuper ? 1 : 0.7);
            att.avatar.glowBoost = 0.8;
          }
          const mine = this.opts.localIds.includes(e.attacker) || this.opts.localIds.includes(e.target);
          this.arena.shake = Math.min(1.5, this.arena.shake + (e.isSuper ? 1.4 : e.blocked ? 0.15 : 0.35 + e.damage / 40) * (mine ? 1 : 0.5));
          if (USE_HEROES && !e.blocked && !e.shielded && (e.isSuper || e.damage >= 12)) {
            // Heavy hit: hit-stop (freeze the animation a few frames) and a white flash.
            this.hitStopUntil = this.time + (e.isSuper ? 0.12 : 0.07);
            this.vfx.flash();
          }
          if (e.blocked || e.shielded) sfx.sfxBlock();
          else if (e.isSuper) sfx.sfxSuper();
          else sfx.sfxPunch(e.damage / 15);
          break;
        }
        case 'cage': {
          // Slammed into the fence: the panel shakes, a heavy spark at the contact point, a camera kick.
          const cp = new THREE.Vector3(e.x, e.y, e.z);
          const strength = Math.min(1.5, e.speed / 5);
          this.arena.stage?.cageHit(e.x, e.z, strength);
          this.vfx.burst(cp, 0xffffff, 30, 5, 0.06);
          this.vfx.burst(cp, 0xffc53d, 20, 3.5, 0.05);
          this.arena.shake = Math.min(1.5, this.arena.shake + 0.3 + strength * 0.5);
          sfx.sfxPunch(Math.min(1, strength));
          break;
        }
        case 'whiff':
          sfx.sfxWhoosh();
          break;
        case 'super': {
          const s = this.slots.get(e.id);
          if (!s) break;
          const col = s.snap.color;
          if (e.kind === 'ironwall') {
            this.vfx.shockwave(s.pos.clone().setY(1), 0xffc53d, 2);
            this.showBanner('IRON WALL!', 900, true);
          } else if (e.kind === 'uppercut') {
            if (!USE_HEROES) this.vfx.pillar(s.pos, col);
            else this.vfx.speedLines();
            this.vfx.groundRing(s.pos, col, 1.2);
            this.showBanner('SUPER UPPERCUT!', 1200, true);
            this.slowmoUntil = this.time + 1.2;
          } else {
            this.vfx.groundRing(s.pos, col, 1.5);
            this.showBanner('ENERGY BLAST!', 900, true);
          }
          s.avatar.glowBoost = 1.5;
          sfx.sfxSuper();
          break;
        }
        case 'guard_break': {
          // Bubble shatters: glass shards, glass sound, a short shake.
          const gp = new THREE.Vector3((e as any).x ?? 0, (e as any).y ?? 1.3, (e as any).z ?? 0);
          this.vfx.burst(gp, 0x8fd0ff, 26, 4.5, 0.04);
          this.vfx.burst(gp, 0xffe14d, 10, 3, 0.035);
          this.vfx.shockwave(gp, 0x9fdcff, 0.9);
          this.arena.shake = Math.min(1.5, this.arena.shake + 0.8);
          sfx.sfxGlass();
          const mine = this.opts.localIds.includes(e.id) || (e.attacker != null && this.opts.localIds.includes(e.attacker));
          if (this.snap && this.snap.f.length > 2) this.addKoFeed(`${e.attacker != null ? this.name(e.attacker) + ' broke ' + this.name(e.id) + '’s guard' : this.name(e.id) + '’s guard ran out'}`);
          else if (mine) this.showBanner('GUARD BREAK!', 1000, true);
          if (this.opts.localIds.includes(e.id)) this.hint('Guard broken! Drop your arms between hits so the GUARD meter refills.', 3000);
          break;
        }
        case 'iron_counter': {
          const w = this.slots.get(e.id);
          const att = this.slots.get(e.attacker);
          if (w) this.vfx.shockwave(w.pos.clone().setY(1.2), 0xffc53d, 1.6);
          // The attacker bounces off the wall: big flinch / knockback reaction.
          if (w && att) att.avatar.flinchFrom(att.pos.clone().sub(w.pos), 1);
          sfx.sfxBlock();
        }
          if (this.snap && this.snap.f.length > 2) this.addKoFeed(`${this.name(e.id)}’s Iron Wall countered ${this.name(e.attacker)}`);
          else this.showBanner('COUNTER!', 800, true);
          break;
        case 'super_denied':
          if (this.opts.localIds.includes(e.id)) this.hint(e.reason === 'meter' ? 'Fill your SUPER meter first: land hits!' : 'Super on cooldown');
          break;
        case 'ko': {
          // The KO lands with the punch: wait for a pending contact on this fighter.
          const pend = this.pendingHits.find((p) => (p.e as any).target === e.target && p.e.type === 'hit');
          if (pend && !(e as any).__delayed) {
            this.pendingHits.push({ at: pend.at + 0.001, e: { ...e, __delayed: true } as SimEvent });
            break;
          }
          this.announcer.onEvent(e, this.snap);
          const tgt = this.slots.get(e.target);
          if (tgt && USE_HEROES && e.ringout) {
            this.vfx.koStreak(tgt.pos.clone(), tgt.snap.color);
            this.vfx.flash();
            this.fallCamUntil = this.time + 0.6;
            this.fallTarget = e.target;
          }
          if (tgt) {
            this.vfx.burst(tgt.pos.clone().setY(1.2), tgt.snap.color, 16, 4, 0.05);
            this.vfx.groundRing(tgt.pos, 0xffc53d, 1.6);
          }
          if (this.snap && this.snap.f.length > 2) {
            this.addKoFeed(e.attacker != null ? `${this.name(e.attacker)} ${verb(e.kind, e.ringout)} ${this.name(e.target)}` : `${this.name(e.target)} was knocked out`);
          } else {
            this.showBanner('K.O.!', 1800, true);
            this.slowmoUntil = this.time + 1.6;
          }
          sfx.sfxKO();
          break;
        }
        case 'round_start':
          this.lastCountdown = -1;
          this.showBanner(`ROUND ${e.n}`, 900);
          break;
        case 'fight':
          this.showBanner('FIGHT!', 700, true);
          sfx.sfxBeep(true);
          break;
        case 'round_end':
          if (e.reason === 'time') this.showBanner(e.winner == null ? 'DRAW ROUND' : 'TIME!', 1500);
          break;
        case 'respawn':
          break;
        case 'match_over':
          break;
      }
    }
  }

  private addKoFeed(text: string) {
    const d = document.createElement('div');
    d.textContent = text;
    this.koFeed.prepend(d);
    while (this.koFeed.children.length > 5) this.koFeed.lastChild?.remove();
    setTimeout(() => d.remove(), 6000);
  }

  showBanner(text: string, ms = 1000, gold = false) {
    const b = $('banner');
    b.textContent = text;
    b.classList.toggle('gold', gold);
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), ms);
  }

  hint(text: string, ms = 2200) {
    const h = $('hint');
    h.textContent = text;
    h.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => h.classList.remove('show'), ms);
  }

  get slowmo() {
    return this.time < this.slowmoUntil || (this.snap?.slow ?? 0) === 1;
  }

  /** Per-frame render. dt in real seconds. */
  frame(dt: number) {
    this.time += dt;
    if (this.pendingHits.length) {
      const due = this.pendingHits.filter((p) => p.at <= this.time);
      if (due.length) {
        this.pendingHits = this.pendingHits.filter((p) => p.at > this.time);
        this.handleEvents(due.map((p) => p.e));
      }
    }
    const s = this.snap;
    const animDt = this.time < this.hitStopUntil ? 0 : this.slowmo ? dt * 0.3 : dt;
    if (s) {
      const myId = this.opts.localIds[0];
      const me = s.f.find((f) => f.id === myId);
      for (const f of s.f) {
        const slot = this.slots.get(f.id);
        if (!slot) continue;
        // Smooth toward snapshot positions.
        const k = 1 - Math.exp(-dt * 18);
        const target = new THREE.Vector3(f.x, 0, f.z);
        // Teleports (new round, respawn) snap instead of gliding across the stage. A fighter about to be hit holds
        // still until the fist lands (the knockback starts at the contact frame).
        const awaitingHit = this.pendingHits.some((p) => (p.e as any).target === f.id);
        if (slot.pos.distanceTo(target) > 2.2) {
          slot.pos.copy(target);
          if (f.id === myId) this.camCut = true; // your fighter teleported (round start, respawn): cut, don't sweep
        }
        else if (!awaitingHit) slot.pos.lerp(target, k);
        slot.yaw += wrap(f.yaw - slot.yaw) * k;
        slot.avatar.root.position.copy(slot.pos);
        slot.avatar.root.rotation.y = slot.yaw;
        let joints: Joints | null = null;
        // Your own fighter mirrors your live pose immediately (also during calibration and the countdown).
        if (this.opts.localIds.includes(f.id)) {
          joints = this.opts.localJoints(f.id);
          if (joints && !(window as any).__brawl.mirrorAt) (window as any).__brawl.mirrorAt = performance.now();
        }
        if (!joints && f.pr) joints = unpackJoints(f.j as number[] | undefined);
        if (!joints) {
          // Idle guard (or the procedural strike) when no live pose: absent players, bots without data.
          joints = proceduralJoints({ atk: f.atk ? { k: f.atk.k, h: f.atk.h, age: f.atk.age } : null, blocking: !!f.b, shield: f.iw > 0, t: this.time, seed: f.id });
        }
        if (slot.avatar instanceof HeroFighter) {
          // Heroes: humans' torso/arms follow their live pose; bots use authored clips.
          const live = !f.bot && !!f.pr && (this.opts.localIds.includes(f.id) ? !!this.opts.localJoints(f.id) : !!f.j);
          slot.avatar.livePose = live;
          slot.avatar.setJoints(live ? joints : null);
          if (f.atk && f.atk.age < 0.3) {
            // Hits already started this strike aimed at the target (handleEvents); anything else is a whiff into the air.
            slot.avatar.attack(f.atk.k, f.atk.h, `${f.atk.k}${f.atk.h}${(s.t - f.atk.age).toFixed(2)}`, null);
          }
          const fa = f as any;
          slot.avatar.update(animDt, this.time, { shield: 0, meterFull: f.meter >= 100, airborne: awaitingHit ? 0 : f.y, alive: !!f.alive || awaitingHit, blocking: !!f.b, guard: fa.gd ?? 100, dizzy: (fa.dz ?? 0) > 0, ironWall: (fa.iw ?? 0) > 0 });
        } else {
          slot.avatar.setJoints(joints);
          slot.avatar.update(animDt, this.time, { shield: f.iw, meterFull: f.meter >= 100, airborne: f.y, alive: !!f.alive || s.f.length <= 2 });
        }
        slot.avatar.setTargeted(s.f.length > 2 && me?.tg === f.id);
        if (slot.avatar instanceof HeroFighter) slot.avatar.setMarker(s.f.length > 2 && f.id === myId);
        slot.avatar.setSeeThroughCape(this.opts.camera !== 'side' && f.id === myId);
        if (f.hp < slot.lastHp && f.hp > 0 && f.hp < 30 && slot.lastHp >= 30 && this.opts.localIds.includes(f.id)) this.hint('Low health: block with forearms up!');
        slot.lastHp = f.hp;
        // Punch trails for strikes in progress
        if (!USE_HEROES && f.atk && f.atk.age < 0.15 && (f.atk.k === 'jab' || f.atk.k === 'hook' || f.atk.k === 'uppercut' || f.atk.k === 'super_uppercut')) {
          this.vfx.trail(slot.avatar.glovePos(f.atk.h === 'L' ? 'L' : 'R'), f.color);
        }
      }
      // Octagon size follows the mode.
      if (this.arena.stage) this.arena.stage.setRadius((s as any).R ?? this.arena.stage.radius);
      const owners = new Map<number, number>(s.p.map((p) => [p.id, p.o]));
      this.vfx.setProjectiles(s.p, (id) => this.color(id), owners);
      this.updateCamera(dt, s);
      this.updateHud(s);
    }
    this.vfx.update(animDt);
    this.arena.update(this.time);
    this.arena.render();
  }

  private updateCamera(dt: number, s: Snapshot) {
    const myId = this.opts.localIds[0];
    const me = this.slots.get(myId);
    const others = [...this.slots.values()].filter((x) => x.snap.id !== myId);
    const opp = me && me.snap.tg != null ? this.slots.get(me.snap.tg) : others[0];
    const portrait = this.arena.camera.aspect < 1;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (this.opts.camera === 'side' || !me) {
      // Both fighters side-on.
      const a = [...this.slots.values()];
      const center = new THREE.Vector3();
      a.forEach((x) => center.add(x.pos));
      center.divideScalar(Math.max(1, a.length));
      const span = a.length >= 2 ? a[0].pos.distanceTo(a[1].pos) : 1;
      const axis = a.length >= 2 ? a[1].pos.clone().sub(a[0].pos).normalize() : new THREE.Vector3(0, 0, 1);
      const perp = new THREE.Vector3(axis.z, 0, -axis.x);
      if (perp.z < 0) perp.negate();
      pos = center.clone().addScaledVector(perp, (portrait ? 5.2 : 3.3) + span * 0.6).setY(1.6);
      look = center.clone().setY(1.15);
    } else if (this.opts.camera === 'wide') {
      const back = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
      if (USE_HEROES) {
        // Brawl: a chase camera behind your fighter (you stay nearest the camera and largest in frame).
        let near = 0;
        for (const o of others) if (o.snap.alive) near = Math.max(near, Math.min(4, o.pos.distanceTo(me.pos)));
        const fwd = new THREE.Vector3(-back.x, 0, -back.z);
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        pos = me.pos.clone().addScaledVector(fwd, portrait ? -3.6 : -3.0).addScaledVector(right, 1.1).setY((portrait ? 2.6 : 2.3) + near * 0.08);
        const tgt = me.snap.tg != null ? this.slots.get(me.snap.tg) : undefined;
        look = (tgt ? tgt.pos.clone().lerp(me.pos, 0.35) : me.pos.clone().addScaledVector(fwd, 1.6)).setY(1.1);
      } else {
        pos = me.pos.clone().addScaledVector(back, portrait ? 7 : 5).setY(portrait ? 6 : 4.2);
        look = me.pos.clone().addScaledVector(back, -2).setY(0.9);
      }
    } else {
      // Over the shoulder, slightly to the right so the opponent is in clear view.
      const fwd = new THREE.Vector3(Math.sin(me.yaw), 0, Math.cos(me.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      if (USE_HEROES) {
        // Closer over-the-shoulder framing: both fighters fill most of the frame height.
        // Higher and further to the side than before so the chibi heroes' big heads never hide the opponent.
        // Over the right shoulder of a 1.8 m fighter: you on the left third, the opponent clear in the middle.
        if (CAM_MODE === 'inside') {
          // ?cam=inside: about 35 degrees off the shoulder line, kept inside the cage (swings around you at the fence).
          pos = me.pos.clone().addScaledVector(fwd, portrait ? -3.1 : -2.2).addScaledVector(right, portrait ? 1.4 : 2.1).setY(portrait ? 2.1 : 1.85);
        } else {
          // ?cam=behind (default, the user's preferred angle): behind your fighter, slightly over the right shoulder,
          // not clamped to the cage; occluding cage parts fade and your fighter turns see-through if it covers the opponent.
          pos = me.pos.clone().addScaledVector(fwd, portrait ? -3.4 : -2.6).addScaledVector(right, portrait ? 0.95 : 1.4).setY(portrait ? 2.1 : 1.85);
        }
        look = (opp ? opp.pos.clone().lerp(me.pos, 0.1) : me.pos.clone().addScaledVector(fwd, 1.4)).setY(1.2);
      } else {
        pos = me.pos.clone().addScaledVector(fwd, portrait ? -3.6 : -2.7).addScaledVector(right, portrait ? 0.7 : 1.05).setY(portrait ? 2.3 : 2.0);
        look = (opp ? opp.pos.clone() : me.pos.clone().addScaledVector(fwd, 1.5)).setY(1.2);
      }
      if (me.snap.y > 0.3 && opp) look = look.clone().lerp(me.pos.clone().setY(1 + me.snap.y), 0.5); // keep a launched you in frame
      if (this.slowmo && opp) {
        // Dramatic side angle during slow motion, framing both fighters and the launch.
        // Frame both fighters (whoever is launched stays in shot until they land).
        const a = me.avatar.root.position.clone().setY(1 + (me.snap.y ?? 0));
        const b2 = opp.avatar.root.position.clone().setY(1 + (opp.snap.y ?? 0));
        const mid = a.clone().add(b2).multiplyScalar(0.5);
        const span = a.distanceTo(b2);
        // Stay on the side the camera is already on (never flip across the fight).
        const side = Math.sign(this.arena.camera.position.clone().sub(mid).dot(right)) || 1;
        pos = mid.clone().addScaledVector(right, side * (3.0 + span * 0.8)).setY(1.5 + span * 0.15);
        look = mid.clone();
      }
    }
    // Ring-out: the camera follows the falling fighter for a moment.
    if (this.time < this.fallCamUntil && this.fallTarget != null) {
      const ft = this.slots.get(this.fallTarget);
      if (ft) look = look.clone().lerp(ft.avatar.root.getWorldPosition(new THREE.Vector3()).setY(ft.snap.y ?? 0), 0.6);
    }
    // Keep the camera inside the octagon cage (never behind a post, pad or the chain-link). Near the fence, swing the
    // camera around you (keeping its height and distance) instead of pushing it in or lifting it.
    // Every mode except ?cam=free keeps the camera inside the cage (the behind angle swings around the fight when it
    // would otherwise back out through the fence).
    if (USE_HEROES && this.arena.stage && CAM_MODE !== 'free') {
      const A = apothem(this.arena.stage.radius) - 0.35;
      const outside = (p: THREE.Vector3) => {
        let m = 0;
        for (let k = 0; k < 8; k++) {
          const ang = ((k + 0.5) / 8) * Math.PI * 2 + Math.PI / 8;
          m = Math.max(m, p.x * Math.cos(ang) + p.z * Math.sin(ang) - A);
        }
        return m;
      };
      if (me) {
        // Orbit the camera around your fighter by a smoothed swing angle (no jumps between sides):
        // the swing grows only as far as needed to stay inside the cage, or to see the opponent past your fighter.
        const off = pos.clone().sub(me.pos);
        const rot = (deg: number) => {
          const c = me.pos.clone().add(off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180));
          c.y = pos.y;
          return c;
        };
        let want = 0;
        if (outside(pos) > 0) {
          // Smallest swing that fits, preferring the side we're already swung to.
          const side = this.camSwing >= 0 ? 1 : -1;
          let found = false;
          for (let d = 10; d <= 120 && !found; d += 10)
            for (const sgn of [side, -side])
              if (outside(rot(sgn * d)) <= 0) {
                want = sgn * d;
                found = true;
                break;
              }
          if (!found) want = this.camSwing;
        }
        // Opponent hidden behind you: swing toward your fighter's left (camera moves right of the line), a bit at a time.
        if (this.camStats.oppVisible < 0.8) this.camVisBias = Math.min(35, this.camVisBias + 60 * dt);
        else this.camVisBias = Math.max(0, this.camVisBias - 25 * dt);
        want += want >= 0 ? this.camVisBias : -this.camVisBias; // +angle widens the over-the-shoulder offset
        this.camSwing += (want - this.camSwing) * Math.min(1, dt * 3);
        if (Math.abs(this.camSwing) > 0.5) pos = rot(this.camSwing);
      }
      for (let k = 0; k < 8; k++) {
        const ang = ((k + 0.5) / 8) * Math.PI * 2 + Math.PI / 8;
        const over = pos.x * Math.cos(ang) + pos.z * Math.sin(ang) - A;
        if (over > 0) {
          pos.x -= Math.cos(ang) * over;
          pos.z -= Math.sin(ang) * over;
        }
      }
    }
    this.arena.setCamera(pos, look, dt, this.camCut);
    if (this.camCut) this.camSwing = 0;
    this.camCut = false;
    this.updateVisibility(dt);
    void s;
  }

  /** Review metrics (section 11): cage occlusion, opponent visibility, camera jumps. */
  camStats = { occlusion: 0, oppVisible: 1, jumps: 0, frames: 0, occlusionSum: 0, oppVisibleSum: 0 };
  private lastCamPos: THREE.Vector3 | null = null;
  private camSwing = 0;
  private camCut = false;
  private camVisBias = 0;

  /** Fade cage parts that hide a fighter; make your own fighter see-through when it covers the opponent. */
  private updateVisibility(dt: number) {
    if (!USE_HEROES || !this.arena.stage) return;
    const cam = this.arena.camera;
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const pts: THREE.Vector3[] = [];
    for (const sl of this.slots.values()) if (sl.avatar instanceof HeroFighter && sl.avatar.root.visible) pts.push(...sl.avatar.samplePoints());
    this.arena.stage.updateOcclusion(cam, pts, dt);
    const myId = this.opts.localIds[0];
    const me = this.slots.get(myId);
    const oppId = me?.snap.tg ?? [...this.slots.keys()].find((k) => k !== myId);
    const opp = oppId != null ? this.slots.get(oppId) : undefined;
    let vis = 1;
    if (me?.avatar instanceof HeroFighter && opp?.avatar instanceof HeroFighter && this.slots.size === 2) {
      const op = opp.avatar.samplePoints().slice(0, 4); // head, chest, hands: the opponent's upper body
      let seen = 0;
      for (const p of op) {
        const dir = p.clone().sub(camPos);
        const d = dir.length();
        if (!me.avatar.blocksRay(camPos, dir.normalize(), d)) seen++;
      }
      vis = op.length ? seen / op.length : 1;
      // No see-through (a semi-transparent skinned mesh shows its inner surfaces): the camera swings instead.
      me.avatar.setOpacity(1, dt);
    }
    const st = this.camStats;
    st.frames++;
    st.occlusion = this.arena.stage.occlusion;
    st.oppVisible = vis;
    st.occlusionSum += st.occlusion;
    st.oppVisibleSum += vis;
    if (this.lastCamPos && this.lastCamPos.distanceTo(camPos) > 0.3) st.jumps++;
    this.lastCamPos = camPos;
  }

  private updateHud(s: Snapshot) {
    const timer = $('timer');
    timer.textContent = String(Math.ceil(s.timer));
    $('round-label').textContent = s.f.length > 2 ? 'BRAWL' : `ROUND ${s.round}`;
    if (s.phase === 'countdown') {
      const n = Math.ceil(s.phaseLeft);
      if (n !== this.lastCountdown && n > 0 && n <= 3) {
        this.lastCountdown = n;
        this.showBanner(String(n), 700);
        sfx.sfxBeep(false);
      }
    }
    const brawl = s.f.length > 2;
    $('brawl-board').classList.toggle('hidden', !brawl);
    document.querySelector('.bars')!.classList.toggle('hidden', brawl && false);
    const myId = this.opts.localIds[0];
    // Bars: in 1v1 left = first local fighter (or first fighter), right = opponent.
    const left = s.f.find((f) => f.id === myId) ?? s.f[0];
    const right = brawl ? s.f.find((f) => f.id === left?.tg) : s.f.find((f) => f.id !== left?.id);
    this.fillSide('p1', left);
    this.fillSide('p2', right);
    if (brawl) {
      const rows = [...s.f].sort((a, b) => b.kos - a.kos || a.deaths - b.deaths);
      $('brawl-board').innerHTML = rows
        .map((f) => `<div class="r ${f.id === myId ? 'me' : ''}"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${safeColor(f.color)}"></span><span class="n">${escapeHtml(f.name)}${f.alive ? '' : ' 💀'}</span><span>${f.kos} KO</span><span>${f.kb}%</span></div>`)
        .join('');
    }
  }

  private fillSide(p: 'p1' | 'p2', f: FighterSnap | undefined) {
    const name = $(`${p}-name`);
    if (!f) {
      name.textContent = '';
      ($(`${p}-hp`) as HTMLElement).style.width = '0%';
      return;
    }
    // "(not in frame)" only during a fight: during calibration and the tutorial no input reaches the match yet.
    name.textContent = f.name + (f.bot ? ' 🤖' : '') + (f.pr || f.bot || this.snap?.phase !== 'fight' || this.calibrating ? '' : ' (not in frame)');
    const hp = $(`${p}-hp`) as HTMLElement;
    hp.style.width = `${f.hp}%`;
    hp.classList.toggle('low', f.hp < 30);
    ($(`${p}-hp-lag`) as HTMLElement).style.width = `${f.hp}%`;
    ($(`${p}-meter`) as HTMLElement).style.width = `${f.meter}%`;
    const meter = $(`${p}-meter`).parentElement!;
    meter.classList.toggle('full', f.meter >= 100);
    $(`${p}-meter-label`).textContent = f.meter >= 100 ? 'SUPER READY' : 'SUPER';
    // Guard meter: blue (full) -> yellow -> red (about to break); flashes while guard-broken, gold during Iron Wall.
    const gd = f.dz > 0 ? 0 : f.gd;
    ($(`${p}-guard`) as HTMLElement).style.width = `${f.iw > 0 ? 100 : gd}%`;
    const guard = $(`${p}-guard`).parentElement!;
    const level = f.iw > 0 ? 'iron' : f.dz > 0 ? 'broken' : gd > 60 ? 'hi' : gd > 30 ? 'mid' : 'lo';
    if (guard.dataset.level !== level) {
      guard.dataset.level = level;
      $(`${p}-guard-label`).textContent = level === 'iron' ? 'IRON WALL' : level === 'broken' ? 'GUARD BROKEN' : 'GUARD';
    }
    guard.classList.toggle('up', !!f.b);
    const pips = $(`${p}-pips`);
    const want = this.snap && this.snap.f.length <= 2 ? `${'<span class="pip won"></span>'.repeat(f.rw)}${'<span class="pip"></span>'.repeat(Math.max(0, 2 - f.rw))}` : `${f.kos} KO · ${f.kb}%`;
    if (pips.innerHTML !== want) pips.innerHTML = want;
  }

  dispose() {
    this.announcer.stop();
    for (const s of this.slots.values()) s.avatar.dispose();
    this.slots.clear();
    this.vfx.dispose();
    this.koFeed.innerHTML = '';
  }
}

function verb(kind: string, ringout: boolean) {
  if (ringout) return 'rang out';
  return ({ super_uppercut: 'super-uppercut', uppercut: 'uppercut', hook: 'hooked', jab: 'jabbed', kick: 'kicked', blast: 'blasted' } as Record<string, string>)[kind] ?? 'KO’d';
}

function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function safeColor(c: string) {
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#888888';
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
