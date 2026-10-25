// Renders a match from simulation snapshots and events, for local and online sessions alike.
import * as THREE from 'three';
import { Arena } from './arena';
import { FighterAvatar } from './avatar';
import { HeroFighter, HERO_MODELS, THROW_T, throwArc } from './hero';
import { apothem } from './stage';
import { Announcer } from './announcer';

/** New Smash-style heroes by default; the original VRM renderer stays behind ?classic (and capsules behind ?lowgfx). */
/**
 * 1v1 camera. 'free' is the default (REVIEW.md 7:16 AM, the user: the behind mode's cage swing and visibility swing
 * read as shaky): behind your fighter, no swing; cage parts still fade, and the clearance, KO and slow-motion shots
 * still apply. ?cam=behind (swing to stay inside the cage) and ?cam=inside stay selectable.
 */
export const CAM_MODE: 'behind' | 'inside' | 'free' = (() => {
  const c = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cam') : null;
  return c === 'inside' ? 'inside' : c === 'behind' ? 'behind' : 'free';
})();
export const USE_HEROES = typeof location !== 'undefined' && !new URLSearchParams(location.search).has('classic') && !FighterAvatar.lowGfx;
import { VFX, SPRITE_SPARKS } from './vfx';
import * as sfx from './audio';
import { unpackJoints, type Joints } from '../../../shared/joints';
import { proceduralJoints } from '../../../shared/animate';
import { TUNING, type Snapshot, type FighterSnap, type SimEvent } from '../../../shared/sim';

export interface ViewOptions {
  /** Fighter ids controlled on this device (camera follows the first). */
  localIds: number[];
  /** Live joints for local fighters (zero latency); falls back to snapshot joints. */
  localJoints: (id: number) => Joints | null;
  /** 'behind' = over-the-shoulder 1v1, 'side' = both fighters side-on, 'wide' = three-quarter arena view. */
  camera: 'behind' | 'side' | 'wide' | 'drill';
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
  /**
   * Shoulder Throw in progress (grappling beta, REVIEW.md 7:05 AM): the choreography clock (THROW_T, advanced by the
   * animation dt so the slam's hit-stop freezes it), both fighters, the line between them at the start (u, a0, d0),
   * where the target lands (landU along u, plus a small sideways offset lat), and one held side camera. The throw's hit,
   * 'throw' and K.O. events are held until the slam so the impact, damage number and banner land with the body.
   */
  private throwSeq: {
    att: number; tgt: number; t: number; u: THREE.Vector3; a0: THREE.Vector3; d0: number; yawA: number; yawT: number; sign: number;
    landU: number; lat: THREE.Vector3; resolved: boolean; slammed: boolean; held: SimEvent[];
    camFrom: THREE.Vector3; lookFrom: THREE.Vector3; camPos: THREE.Vector3; camLook: THREE.Vector3;
  } | null = null;
  /** After a throw: the thrown fighter turns back toward the thrower gently instead of spinning in a frame or two. */
  private slowTurn = new Map<number, number>();

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
      const slamReplay = !!(e as any).__throwSlam;
      if (!slamReplay) this.onEvent?.(e);
      // Shoulder Throw: its hit, 'throw' and K.O. events wait for the slam (the body is still in the air until then).
      if (!slamReplay && this.holdForThrow(e)) continue;
      // Announcer for everything except hits and KOs (those are announced when they land on screen, below).
      if (e.type !== 'hit' && e.type !== 'ko') this.announcer.onEvent(e, this.snap);
      switch (e.type) {
        case 'hit': {
          if (slamReplay) {
            this.throwSlamHit(e);
            break;
          }
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
          if (e.kind === 'super_uppercut' && !e.shielded) this.showBanner('SUPER UPPERCUT!', 1200, true);
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
          // A hard slam gets the slow-motion side camera (review round 9: the slam happened behind your fighter).
          if (e.speed >= 5) this.slowmoUntil = Math.max(this.slowmoUntil, this.time + 0.9);
          break;
        }
        case 'throw' as any: {
          // Shoulder Throw lands: slam on the mat, dust, shake, banner (the announcer calls it). With the hero renderer
          // this runs at the slam (the body hits the mat), not when the sim resolves the throw.
          const ev = e as any;
          const p = new THREE.Vector3(ev.x ?? 0, 0.1, ev.z ?? 0);
          if (slamReplay) {
            const tg = this.slots.get(ev.target);
            if (tg?.avatar instanceof HeroFighter && tg.avatar.bones.spine_02) p.copy(tg.avatar.bones.spine_02.getWorldPosition(new THREE.Vector3())).setY(0.1);
            this.vfx.burst(p, 0xc9b79c, 26, 3.4, 0.07);
            this.vfx.burst(p.clone().setY(0.3), 0xffffff, 10, 2.2, 0.04);
          } else this.vfx.burst(p, 0xc9b79c, 16, 3, 0.06);
          this.vfx.groundRing(p, 0xffc53d, 1.0);
          this.arena.shake = Math.min(1.5, this.arena.shake + 1.0);
          this.showBanner('SHOULDER THROW!', 1300, true);
          sfx.sfxPunch(1);
          break;
        }
        case 'whiff':
          sfx.sfxWhoosh();
          break;
        case 'super': {
          const s = this.slots.get(e.id);
          if (!s) break;
          const col = s.snap.color;
          if ((e.kind as string) === 'throw') {
            s.avatar.glowBoost = 1.2; // the throw's banner and slam come with the 'throw' event
            this.startThrow(e.id);
            break;
          } else if (e.kind === 'ironwall') {
            this.vfx.shockwave(s.pos.clone().setY(1), 0xffc53d, 2);
            this.showBanner('IRON WALL!', 900, true);
          } else if (e.kind === 'uppercut') {
            if (!USE_HEROES) this.vfx.pillar(s.pos, col);
            else this.vfx.speedLines();
            this.vfx.groundRing(s.pos, col, 1.2);
            // The banner waits for the uppercut to land (an Iron Wall can counter it: review round 9/10, shield scene).
            this.slowmoUntil = this.time + 1.2;
          } else {
            this.vfx.groundRing(s.pos, col, 1.5);
            this.showBanner('ENERGY BLAST!', 900, true);
            this.slowmoUntil = this.time + 0.9; // side camera frames the blast crossing the gap
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
          this.endThrow();
          this.lastCountdown = -1;
          // Tips from the previous round (or the warm-up) don't carry over.
          clearTimeout(this.hintTimer);
          $('hint').classList.remove('show');
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
    // A Shoulder Throw plays at full speed (its slam has a hit-stop instead of the sim's slow motion).
    return this.time < this.slowmoUntil || (!this.throwSeq && (this.snap?.slow ?? 0) === 1);
  }

  /** Hold a Shoulder Throw's hit / 'throw' / K.O. events until the slam; end the throw if it was cancelled. */
  private holdForThrow(e: SimEvent): boolean {
    const ts = this.throwSeq;
    if (!ts) return false;
    const ev = e as any;
    if ((e.type === 'whiff' && ev.kind === 'throw' && ev.attacker === ts.att) || ((e.type as string) === 'grab_cancel' && ev.k === 't' && ev.id === ts.att)) {
      this.endThrow();
      return false;
    }
    if (ts.slammed) return false;
    if (e.type === 'hit' && ev.kind === 'throw' && ev.attacker === ts.att) {
      if (ev.shielded) {
        this.endThrow(); // the Iron Wall stopped it
        return false;
      }
      ts.tgt = ev.target;
      ts.held.push(e);
      return true;
    }
    if ((e.type as string) === 'throw' && ev.id === ts.att) {
      ts.tgt = ev.target;
      const L = new THREE.Vector3(ev.x, 0, ev.z).sub(ts.a0);
      ts.landU = L.dot(ts.u);
      ts.lat = L.addScaledVector(ts.u, -ts.landU).setY(0);
      ts.resolved = true;
      ts.held.push(e);
      return true;
    }
    if (e.type === 'ko' && ev.target === ts.tgt) {
      ts.held.push(e);
      return true;
    }
    return false;
  }

  /** The throw's hit, shown when the body hits the mat: damage at the body, hit-stop, flash, shake. No flinch clip. */
  private throwSlamHit(e: Extract<SimEvent, { type: 'hit' }>) {
    this.announcer.onEvent(e, this.snap);
    const tgt = this.slots.get(e.target);
    const att = this.slots.get(e.attacker);
    const p = new THREE.Vector3(e.x, e.y, e.z);
    if (tgt?.avatar instanceof HeroFighter && tgt.avatar.bones.pelvis) p.copy(tgt.avatar.bones.pelvis.getWorldPosition(new THREE.Vector3())).setY(0.25);
    const col = att ? att.snap.color : '#fff';
    // Impact sparks on the body at the mat; the damage number floats over the legs, away from the thrower (no ring
    // in the air over the fighters: REVIEW.md 7:05 AM item 5).
    this.vfx.burst(p, col, 34, 5, 0.07);
    this.vfx.burst(p, 0xffffff, 8, 3, 0.03);
    const away = this.throwSeq ? this.throwSeq.u.clone().negate() : new THREE.Vector3();
    this.vfx.label(p.clone().addScaledVector(away, 0.45).setY(0.85), String(e.damage), 'fx-super');
    if (att) att.avatar.glowBoost = 0.8;
    this.arena.shake = Math.min(1.5, this.arena.shake + 0.6);
    this.hitStopUntil = this.time + 0.15;
    this.vfx.flash();
    sfx.sfxSuper();
  }

  /** Shoulder Throw started (the 'super' event): line up the choreography and the held side camera. */
  private startThrow(attId: number) {
    if (!USE_HEROES) return;
    const a = this.slots.get(attId);
    if (!a || !(a.avatar instanceof HeroFighter)) return;
    let tg = a.snap.tg != null && a.snap.tg !== attId ? this.slots.get(a.snap.tg) : undefined;
    if (!tg) {
      let best = Infinity;
      for (const sl of this.slots.values()) {
        const d = sl.pos.distanceTo(a.pos);
        if (sl !== a && sl.snap.alive && d < best) (best = d), (tg = sl);
      }
    }
    if (!tg || !(tg.avatar instanceof HeroFighter)) return;
    this.endThrow();
    const u = tg.pos.clone().sub(a.pos).setY(0);
    const d0 = Math.max(0.35, u.length());
    if (u.lengthSq() < 1e-6) u.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    u.normalize();
    const a0 = a.pos.clone().setY(0);
    const landU = -TUNING.throwLand;
    // One side camera, perpendicular to the throw, on the side the camera is already on: the clinch's shot (a throw
    // from the clinch needs no camera move at all), wide enough for the target's feet on the mat.
    const side = this.sideOf(a.pos, tg.pos);
    const shot = this.sideShot(a.pos, tg.pos, side);
    const camLook = shot.look;
    const camPos = shot.pos;
    const id = [...this.slots.entries()].find(([, sl]) => sl === tg)![0];
    this.throwSeq = {
      att: attId, tgt: id, t: 0, u, a0, d0, yawA: Math.atan2(u.x, u.z), yawT: Math.atan2(-u.x, -u.z), sign: side, landU, lat: new THREE.Vector3(),
      resolved: false, slammed: false, held: [], camFrom: this.arena.camPos.clone(), lookFrom: this.arena.camLook.clone(), camPos, camLook,
    };
    this.throwWait = 0;
  }
  private throwWait = 0;
  /**
   * Side-on shot of two fighters (clinch and Shoulder Throw; grappling beta): perpendicular to the line from a to b,
   * centred between them, on `side` of that line, framing about 5.6 m by 3.3 m (a Shoulder Throw lands the target's
   * feet about 2.4 m from the pair's centre, and its legs pass 2.5 m up).
   */
  private sideShot(a: THREE.Vector3, b: THREE.Vector3, side: number) {
    const u = b.clone().sub(a).setY(0);
    if (u.lengthSq() < 1e-6) u.set(0, 0, 1);
    u.normalize();
    const perp = new THREE.Vector3(u.z, 0, -u.x);
    const mid = a.clone().add(b).multiplyScalar(0.5).setY(0);
    const cam = this.arena.camera;
    const vHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dist = Math.max(3.3 / (2 * vHalf), 5.6 / (2 * vHalf * cam.aspect));
    return { pos: mid.clone().addScaledVector(perp, side * dist).setY(1.4), look: mid.clone().setY(1.1) };
  }
  /** Which side of the line from a to b the camera is on now (+1 / -1), for sideShot. */
  private sideOf(a: THREE.Vector3, b: THREE.Vector3) {
    const u = b.clone().sub(a).setY(0);
    const perp = new THREE.Vector3(u.z, 0, -u.x);
    return Math.sign(this.arena.camera.position.clone().sub(a.clone().add(b).multiplyScalar(0.5)).dot(perp)) || 1;
  }
  /** Easing back to the normal camera from a clinch or throw side shot until this time, from this camera pose. */
  private grappleEaseUntil = 0;
  private grappleEase: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  private startGrappleEase() {
    this.grappleEase = { pos: this.arena.camPos.clone(), look: this.arena.camLook.clone() };
    this.camEaseUntil = this.grappleEaseUntil = this.time + GRAPPLE_EASE_S;
  }
  /** Clinch side camera in use: [holder id, held id, side], so the side is chosen once per clinch. */
  private clinchCam: [number, number, number] | null = null;

  /** Unit vector across the throw toward the held camera's side. */
  private throwSide(ts: NonNullable<MatchView['throwSeq']>) {
    return new THREE.Vector3(ts.u.z, 0, -ts.u.x).multiplyScalar(ts.sign);
  }

  private endThrow() {
    const ts = this.throwSeq;
    if (!ts) return;
    this.throwSeq = null;
    for (const id of [ts.att, ts.tgt]) {
      const sl = this.slots.get(id);
      if (sl?.avatar instanceof HeroFighter) sl.avatar.throwSeq = null;
    }
    this.slowTurn.set(ts.tgt, this.time + 0.9);
    this.startGrappleEase();
    // Cut short before the slam (round reset, a cancel after it resolved): show what was held.
    if (!ts.slammed && ts.held.length) this.handleEvents(ts.held.map((e) => ({ ...(e as any), __throwSlam: true }) as SimEvent));
  }

  /** Advance the throw clock (animation time: the slam's hit-stop freezes it), fire the slam, end it. */
  private tickThrow(animDt: number, dt: number) {
    const ts = this.throwSeq;
    if (!ts) return;
    if (!this.slots.has(ts.att) || !this.slots.has(ts.tgt)) return this.endThrow();
    ts.t += animDt;
    if (!ts.resolved && ts.t >= THROW_T.arc) {
      // Hold the loaded pose until the sim resolves the throw; give up if it never does.
      ts.t = THROW_T.arc;
      this.throwWait += dt;
      if (this.throwWait > 0.6) return this.endThrow();
    }
    if (ts.resolved && !ts.slammed && ts.t >= THROW_T.slam) {
      ts.slammed = true;
      const held = ts.held;
      ts.held = [];
      this.handleEvents(held.filter((e) => e.type !== 'ko').map((e) => ({ ...(e as any), __throwSlam: true }) as SimEvent));
      // A throw that knocks out: "SHOULDER THROW!" first, then the K.O. call and banner a beat later.
      for (const e of held) if (e.type === 'ko') this.pendingHits.push({ at: this.time + 0.7, e: { ...(e as any), __throwSlam: true, __delayed: true } as SimEvent });
    }
    if (this.throwSeq === ts && ts.t >= THROW_T.end) this.endThrow();
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
    this.tickThrow(animDt, dt);
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
        const ts = this.throwSeq;
        const thrown = !!ts && f.id === ts.tgt;
        if (thrown && ts) {
          // Shoulder Throw: pulled in onto the thrower's back, then over the shoulder to the landing spot (the sim has
          // already moved it there). The thrown fighter keeps its facing until it is back on its feet.
          const arcS = THREE.MathUtils.clamp((ts.t - THROW_T.arc) / (THROW_T.slam - THROW_T.arc), 0, 1);
          const arc = ts.t >= THROW_T.arc && ts.t < THROW_T.slam ? throwArc(ts.t - THROW_T.arc, ts.landU) : null;
          const ur = ts.t < THROW_T.arc ? THREE.MathUtils.lerp(ts.d0, 0.34, sm(ts.t / THROW_T.arc)) : arc ? arc.u - 0.24 * arcS : ts.landU;
          slot.pos.copy(ts.a0).addScaledVector(ts.u, ur).addScaledVector(ts.lat, sm(arcS)).addScaledVector(this.throwSide(ts), arc ? arc.lat : 0);
          slot.yaw = ts.yawT;
        } else if (slot.pos.distanceTo(target) > 1.0) {
          // Nothing moves a metre in one frame (a super launch is ~0.1 m): this is a teleport (round start, respawn,
          // a scripted placement). Snap, and cut the camera when you or your opponent moved.
          slot.pos.copy(target);
          if (f.id === myId || f.id === this.slots.get(myId)?.snap.tg || this.slots.size === 2) this.camCut = true;
        }
        else if (!awaitingHit) slot.pos.lerp(target, k);
        if (ts && f.id === ts.att && ts.t < THROW_T.release) {
          // The thrower turns its back into the target (toward the camera side), and holds until the follow-through.
          slot.yaw = ts.yawA + ts.sign * Math.PI * sm((ts.t + 0.02) / 0.3);
        } else if (!thrown) {
          const turnK = this.time < (this.slowTurn.get(f.id) ?? 0) ? 1 - Math.exp(-dt * 5) : k;
          slot.yaw += wrap(f.yaw - slot.yaw) * turnK;
        }
        slot.avatar.root.position.copy(slot.pos);
        slot.avatar.root.rotation.y = slot.yaw;
        if (slot.avatar instanceof HeroFighter) slot.avatar.hidden = this.opts.camera === 'drill' && f.id !== myId; // drills: only you
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
          if (this.arena.stage) {
            const A = apothem(this.arena.stage.radius);
            let m = 0;
            for (let k = 0; k < 8; k++) {
              const ang = ((k + 0.5) / 8) * Math.PI * 2 + Math.PI / 8;
              m = Math.max(m, f.x * Math.cos(ang) + f.z * Math.sin(ang));
            }
            slot.avatar.edgeDist = A - m; // distance to the nearest fence (limits tumbles so bodies stay inside)
          }
          const clA = fa.cl ? this.slots.get(fa.cl)?.avatar : undefined;
          const tgA = fa.gr && f.tg != null ? this.slots.get(f.tg)?.avatar : undefined;
          slot.avatar.grapple = { with: clA instanceof HeroFighter ? clA : null, holder: !!fa.ch, reaching: fa.gr && tgA instanceof HeroFighter ? tgA : null };
          // Shoulder Throw choreography (both fighters); the thrown one counts as standing until it hits the mat.
          const other = ts ? this.slots.get(thrown ? ts.att : ts.tgt)?.avatar : undefined;
          const role = ts && other instanceof HeroFighter ? (thrown ? 'thrown' : f.id === ts.att && ts.t < THROW_T.release ? 'thrower' : null) : null;
          if (ts && role && other instanceof HeroFighter) {
            const arcS = THREE.MathUtils.clamp((ts.t - THROW_T.arc) / (THROW_T.slam - THROW_T.arc), 0, 1);
            slot.avatar.throwSeq = { role, t: ts.t, other, u: ts.u, side: this.throwSide(ts), a0: ts.a0.clone().addScaledVector(ts.lat, sm(arcS)), d0: ts.d0, landU: ts.landU };
          } else slot.avatar.throwSeq = null;
          const inAir = thrown && !!ts && !ts.slammed;
          slot.avatar.update(animDt, this.time, { shield: 0, meterFull: f.meter >= 100, airborne: awaitingHit || thrown ? 0 : f.y, alive: !!f.alive || awaitingHit || inAir, blocking: !!f.b, guard: fa.gd ?? 100, dizzy: (fa.dz ?? 0) > 0, ironWall: (fa.iw ?? 0) > 0 });
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
      this.announcer.tick(s, this.opts.localIds);
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
    if (this.opts.camera === 'drill' && me) {
      // Drills: a mirror-like front view of your whole body.
      const fwd = new THREE.Vector3(Math.sin(me.yaw), 0, Math.cos(me.yaw));
      pos = me.pos.clone().addScaledVector(fwd, 3.6).setY(1.35);
      look = me.pos.clone().setY(0.95);
      this.arena.setCamera(pos, look, dt);
      this.updateVisibility(dt);
      return;
    }
    const ts = this.throwSeq;
    if (ts && USE_HEROES && (this.slots.size <= 2 || this.opts.localIds.includes(ts.att) || this.opts.localIds.includes(ts.tgt))) {
      // Shoulder Throw: settle into one side camera during the grip (orbiting, not cutting), then hold it still through
      // the turn-in, the arc, the slam, the down time and the get-up.
      const k = sm(ts.t / 0.28);
      const c = ts.camLook;
      const f0 = ts.camFrom.clone().sub(c), f1 = ts.camPos.clone().sub(c);
      const a0 = Math.atan2(f0.x, f0.z), a1 = Math.atan2(f1.x, f1.z);
      const ang = a0 + wrap(a1 - a0) * k;
      const r = THREE.MathUtils.lerp(Math.hypot(f0.x, f0.z), Math.hypot(f1.x, f1.z), k);
      const camPos = c.clone().add(new THREE.Vector3(Math.sin(ang) * r, THREE.MathUtils.lerp(f0.y, f1.y, k), Math.cos(ang) * r));
      this.arena.setCamera(camPos, ts.lookFrom.clone().lerp(c, k), dt, true);
      this.updateVisibility(dt);
      return;
    }
    // Clinch (grappling beta): ease into the side shot that a Shoulder Throw from the clinch will hold, so the throw
    // starts without a camera move. Only for your own clinch (or any clinch in a 1v1).
    const cl = [...this.slots.values()].find((sl) => (sl.snap as any).cl != null && (sl.snap as any).ch && (this.slots.size <= 2 || this.opts.localIds.includes(sl.snap.id) || this.opts.localIds.includes((sl.snap as any).cl)));
    const held = cl ? this.slots.get((cl.snap as any).cl) : undefined;
    if (USE_HEROES && cl && held && this.opts.camera !== 'wide') {
      if (!this.clinchCam || this.clinchCam[0] !== cl.snap.id || this.clinchCam[1] !== held.snap.id) this.clinchCam = [cl.snap.id, held.snap.id, this.sideOf(cl.pos, held.pos)];
      const shot = this.sideShot(cl.pos, held.pos, this.clinchCam[2]);
      this.arena.setCamera(shot.pos, shot.look, dt, false, 4);
      this.updateVisibility(dt);
      return;
    }
    if (this.clinchCam) {
      this.clinchCam = null;
      this.startGrappleEase(); // ease back from the clinch shot
    }
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
        // Look ahead of you (never straight down at your feet), leaning toward your target.
        const tgt = me.snap.tg != null ? this.slots.get(me.snap.tg) : undefined;
        const ahead = me.pos.clone().addScaledVector(fwd, 2.4);
        look = (tgt ? ahead.lerp(tgt.pos, 0.35) : ahead).setY(1.1);
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
        // Stay on the side the camera is already on (never flip across the fight), and on your side of the fight
        // (you stay the near fighter); never closer than 1.3 m to either body.
        const side = Math.sign(this.arena.camera.position.clone().sub(mid).dot(right)) || 1;
        const towardMe = a.clone().sub(b2).setY(0).normalize();
        pos = mid.clone().addScaledVector(right, side * (4.2 + span * 0.9)).addScaledVector(towardMe, 1.4).setY(1.7 + span * 0.15);
        look = mid.clone();
      }
    }
    // KO shot (review round 10: your back hid the downed opponent): a side angle on your side of the fight line,
    // perpendicular to it, framing you and the body on the floor.
    if (USE_HEROES && me && opp && this.opts.camera === 'behind' && (opp.snap.hp <= 0 || me.snap.hp <= 0) && this.snap && this.snap.f.length === 2) {
      const a = me.avatar.root.position.clone();
      const b2 = opp.avatar.root.position.clone();
      const mid = a.clone().add(b2).multiplyScalar(0.5);
      const axis = b2.clone().sub(a).setY(0);
      if (axis.lengthSq() > 1e-4) {
        axis.normalize();
        const perp = new THREE.Vector3(axis.z, 0, -axis.x);
        const side = Math.sign(this.arena.camera.position.clone().sub(mid).dot(perp)) || 1;
        pos = mid.clone().addScaledVector(perp, side * 4.0).addScaledVector(axis, -1.0).setY(2.3);
        look = mid.clone().setY(0.7);
      }
    } else if (USE_HEROES && me && opp && this.opts.camera === 'behind' && !this.slowmo && (me.avatar instanceof HeroFighter) && me.avatar.isDown()) {
      // You are knocked down or tumbling: aim between the fighters so you stay in frame (round 10, getting_hit).
      look = look.clone().lerp(me.avatar.root.position.clone().setY(0.6), 0.45);
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
        // ...and during your own strike, so the fist landing is in view rather than behind your back.
        const striking = !!me.snap.atk && me.snap.atk.age < 0.45;
        const maxBias = this.camStats.oppVisible < 0.6 ? 55 : 35; // mostly hidden (e.g. pinned on the far fence): swing wider
        if (this.camStats.oppVisible < 0.8 || striking) this.camVisBias = Math.min(maxBias, this.camVisBias + (striking ? 90 : 60) * dt);
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
    // Hard rule outside slow motion: your fighter is always nearer the camera than the opponent.
    if (USE_HEROES && me && opp && !this.slowmo && this.opts.camera === 'behind') {
      if (pos.distanceTo(opp.pos) < pos.distanceTo(me.pos) + 0.5) {
        const fwd2 = opp.pos.clone().sub(me.pos).setY(0).normalize();
        const right2 = new THREE.Vector3(-fwd2.z, 0, fwd2.x);
        pos = me.pos.clone().addScaledVector(fwd2, -2.4).addScaledVector(right2, 1.2).setY(pos.y);
        this.camSwing *= 0.5;
      }
    }
    if (USE_HEROES && this.opts.camera === 'behind') pos = this.constrainCamera(pos, look, me, opp);
    // Ease into (and out of) the slow-motion side camera instead of whipping across the arena.
    if (this.slowmo !== this.wasSlowmo) this.camEaseUntil = this.time + 0.8;
    this.wasSlowmo = this.slowmo;
    if (this.grappleEase && this.time < this.grappleEaseUntil && !this.camCut) {
      // Back from a clinch / throw side shot: slow in, slow out, from where the side shot left the camera.
      const k = sm(1 - (this.grappleEaseUntil - this.time) / GRAPPLE_EASE_S);
      this.arena.setCamera(this.grappleEase.pos.clone().lerp(pos, k), this.grappleEase.look.clone().lerp(look, k), dt, true);
    } else this.arena.setCamera(pos, look, dt, this.camCut, this.time < this.camEaseUntil ? 2.2 : 5);
    // The eased camera itself must also obey the rules (its path can cross a fighter or the fight line while easing).
    // Not while easing back from a clinch or Shoulder Throw side shot (grappling beta): from side-on, the fight-line rule
    // would jump the camera up to a metre in one frame (a cut); the target pose above is still constrained.
    if (USE_HEROES && this.opts.camera === 'behind' && this.time >= this.grappleEaseUntil) {
      const cp = this.constrainCamera(this.arena.camPos.clone(), this.arena.camLook, me, opp, false);
      this.arena.camPos.copy(cp);
      this.arena.camera.position.copy(cp);
      this.arena.camera.lookAt(this.arena.camLook);
    } else if (USE_HEROES) {
      const cp = this.arena.camPos;
      for (const sl of this.slots.values()) {
        if (!(sl.avatar instanceof HeroFighter) || !sl.avatar.root.visible) continue;
        const body = sl.avatar.root.position.clone().add(sl.avatar.body.position).setY(0);
        const d = cp.clone().setY(0).sub(body);
        const len = d.length();
        if (len < 1.3) {
          if (len < 1e-3) d.set(0, 0, 1);
          cp.addScaledVector(d.normalize(), 1.3 - len);
        }
      }
      this.arena.camera.position.x = cp.x;
      this.arena.camera.position.z = cp.z;
      this.arena.camera.lookAt(this.arena.camLook);
    }
    if (this.camCut) this.camSwing = 0;
    this.camCut = false;
    this.updateVisibility(dt);
    void s;
  }

  private camTmp = new THREE.PerspectiveCamera();
  /**
   * Camera rules for the fight view (review round 9), applied to the target and to the eased camera:
   * 1. stay on your side of the fight line (also in slow motion), so you are the near fighter;
   * 2. stay clear of every fighter's body in 3D (airborne, tumbling ones included);
   * 3. keep both fighters inside the frame (pull back, or rise when the cage is in the way).
   */
  private constrainCamera(pos: THREE.Vector3, look: THREE.Vector3, me: Slot | undefined, opp: Slot | undefined, frame = true) {
    const p = pos.clone();
    const A = this.arena.stage ? apothem(this.arena.stage.radius) - 0.35 : Infinity;
    const clampCage = (v: THREE.Vector3) => {
      if (CAM_MODE === 'free' || !isFinite(A)) return;
      for (let k = 0; k < 8; k++) {
        const ang = ((k + 0.5) / 8) * Math.PI * 2 + Math.PI / 8;
        const over = v.x * Math.cos(ang) + v.z * Math.sin(ang) - A;
        if (over > 0) (v.x -= Math.cos(ang) * over), (v.z -= Math.sin(ang) * over);
      }
    };
    const pts = (sl: Slot | undefined) => (sl && sl.avatar instanceof HeroFighter && sl.avatar.root.visible ? sl.avatar.samplePoints() : sl ? [sl.pos.clone().setY(1 + (sl.snap.y ?? 0))] : []);
    // 1. Your side of the fight line.
    const shown = (sl: Slot) => sl.avatar.root.visible;
    if (me && opp && shown(me) && shown(opp)) {
      const u = me.pos.clone().sub(opp.pos).setY(0);
      if (u.lengthSq() > 1e-4) {
        u.normalize();
        const mid = me.pos.clone().add(opp.pos).multiplyScalar(0.5);
        const need = this.slowmo ? 0.6 : me.pos.clone().sub(mid).dot(u) + 0.6;
        const have = p.clone().sub(mid).dot(u);
        if (have < need) p.addScaledVector(u, need - have);
      }
    }
    // 2. Clear of every body point in 3D.
    const minD = this.slowmo ? 2.2 : 1.15;
    for (let iter = 0; iter < 3; iter++) {
      for (const sl of this.slots.values()) {
        for (const q of pts(sl)) {
          const d = p.clone().sub(q);
          const len = d.length();
          if (len < minD) {
            d.y = 0;
            if (d.lengthSq() < 1e-4) d.copy(p.clone().sub(look).setY(0));
            if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
            p.addScaledVector(d.normalize(), minD - len);
          }
        }
      }
      clampCage(p);
    }
    // 3. Both fighters in frame.
    // (Points behind the camera are skipped and the rise is capped: a body at the camera's feet must not lift it top-down.)
    if (frame && me && opp && shown(me) && shown(opp)) {
      const cam = this.camTmp;
      cam.fov = this.arena.camera.fov;
      cam.aspect = this.arena.camera.aspect;
      cam.near = 0.05;
      cam.far = 100;
      cam.updateProjectionMatrix();
      const all = [...pts(me), ...pts(opp)];
      const baseY = pos.y;
      for (let step = 0; step < 10; step++) {
        cam.position.copy(p);
        cam.lookAt(look);
        cam.updateMatrixWorld();
        let worst = 0;
        for (const q of all) {
          const n = q.clone().project(cam);
          if (n.z > 1) continue; // behind the camera: rule 2 handles bodies that close
          worst = Math.max(worst, Math.abs(n.x), Math.abs(n.y));
        }
        if (worst <= 0.88) break;
        const back = p.clone().sub(look).setY(0).normalize();
        const before = p.clone();
        p.addScaledVector(back, 0.35);
        clampCage(p);
        // The cage stops pulling back: rise a little (at most 0.4 m above the normal height; rising to 3 m read as a
        // top-down view in the v2 footage). Framing is best effort past that.
        if (p.distanceTo(before) < 0.1) {
          if (p.y >= baseY + 0.4) break;
          p.y = Math.min(baseY + 0.4, p.y + 0.2);
        }
      }
    }
    return p;
  }

  /** Review metrics (section 11): cage occlusion, opponent visibility, camera jumps. */
  camStats = { occlusion: 0, oppVisible: 1, jumps: 0, frames: 0, occlusionSum: 0, oppVisibleSum: 0 };
  private lastCamPos: THREE.Vector3 | null = null;
  private camSwing = 0;
  private camCut = false;
  private wasSlowmo = false;
  private camEaseUntil = 0;
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

/** Seconds to ease from a clinch / Shoulder Throw side shot back to the normal camera. */
const GRAPPLE_EASE_S = 1.0;

/** Smoothstep on 0..1 (clamped). */
function sm(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
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
