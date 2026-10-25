// Renders a match from simulation snapshots and events, for local and online sessions alike.
import * as THREE from 'three';
import { Arena } from './arena';
import { FighterAvatar } from './avatar';
import { VFX } from './vfx';
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
  avatar: FighterAvatar;
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
  private koFeed: HTMLElement;
  onEvent: ((e: SimEvent) => void) | null = null;

  constructor(arena: Arena, opts: ViewOptions) {
    this.arena = arena;
    this.opts = opts;
    this.vfx = new VFX(arena.scene, arena.camera, $('fx-layer'));
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
        const avatar = new FighterAvatar({ color: f.color });
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
      switch (e.type) {
        case 'hit': {
          const tgt = this.slots.get(e.target);
          const att = this.slots.get(e.attacker);
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
          if (e.blocked || e.shielded) sfx.sfxBlock();
          else if (e.isSuper) sfx.sfxSuper();
          else sfx.sfxPunch(e.damage / 15);
          break;
        }
        case 'whiff':
          sfx.sfxWhoosh();
          break;
        case 'super': {
          const s = this.slots.get(e.id);
          if (!s) break;
          const col = s.snap.color;
          if (e.kind === 'shield') {
            this.vfx.shockwave(s.pos.clone().setY(1), 0x66ccff, 2);
            this.showBanner('SHIELD!', 700, true);
          } else if (e.kind === 'uppercut') {
            this.vfx.pillar(s.pos, col);
            this.vfx.groundRing(s.pos, col, 2);
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
        case 'super_denied':
          if (this.opts.localIds.includes(e.id)) this.hint(e.reason === 'meter' ? 'Fill your SUPER meter first: land hits!' : 'Super on cooldown');
          break;
        case 'ko': {
          const tgt = this.slots.get(e.target);
          if (tgt) {
            this.vfx.burst(tgt.pos.clone().setY(1.2), tgt.snap.color, 60, 8, 0.08);
            this.vfx.groundRing(tgt.pos, 0xffc53d, 3);
          }
          if (this.snap && this.snap.f.length > 2) {
            this.addKoFeed(e.attacker != null ? `${this.name(e.attacker)} ${verb(e.kind, e.ringout)} ${this.name(e.target)}` : `${this.name(e.target)} fell out of the ring`);
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
    const s = this.snap;
    const animDt = this.slowmo ? dt * 0.3 : dt;
    if (s) {
      const myId = this.opts.localIds[0];
      const me = s.f.find((f) => f.id === myId);
      for (const f of s.f) {
        const slot = this.slots.get(f.id);
        if (!slot) continue;
        // Smooth toward snapshot positions.
        const k = 1 - Math.exp(-dt * 18);
        slot.pos.lerp(new THREE.Vector3(f.x, 0, f.z), k);
        slot.yaw += wrap(f.yaw - slot.yaw) * k;
        slot.avatar.root.position.copy(slot.pos);
        slot.avatar.root.rotation.y = slot.yaw;
        let joints: Joints | null = null;
        if (this.opts.localIds.includes(f.id) && f.pr) joints = this.opts.localJoints(f.id);
        if (!joints && f.pr) joints = unpackJoints(f.j as number[] | undefined);
        if (!joints) {
          // Idle guard (or the procedural strike) when no live pose: absent players, bots without data.
          joints = proceduralJoints({ atk: f.atk ? { k: f.atk.k, h: f.atk.h, age: f.atk.age } : null, blocking: !!f.b, shield: f.sh > 0, t: this.time, seed: f.id });
        }
        slot.avatar.setJoints(joints);
        slot.avatar.update(animDt, this.time, { shield: f.sh, meterFull: f.meter >= 100, airborne: f.y, alive: !!f.alive || s.f.length <= 2 });
        slot.avatar.setTargeted(s.f.length > 2 && me?.tg === f.id);
        slot.avatar.setSeeThroughCape(this.opts.camera !== 'side' && f.id === myId);
        if (f.hp < slot.lastHp && f.hp > 0 && f.hp < 30 && slot.lastHp >= 30 && this.opts.localIds.includes(f.id)) this.hint('Low health: block with forearms up!');
        slot.lastHp = f.hp;
        // Punch trails for strikes in progress
        if (f.atk && f.atk.age < 0.15 && (f.atk.k === 'jab' || f.atk.k === 'hook' || f.atk.k === 'uppercut' || f.atk.k === 'super_uppercut')) {
          this.vfx.trail(slot.avatar.glovePos(f.atk.h === 'L' ? 'L' : 'R'), f.color);
        }
      }
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
      pos = me.pos.clone().addScaledVector(back, portrait ? 7 : 5).setY(portrait ? 6 : 4.2);
      look = me.pos.clone().addScaledVector(back, -2).setY(0.9);
    } else {
      // Over the shoulder, slightly to the right so the opponent is in clear view.
      const fwd = new THREE.Vector3(Math.sin(me.yaw), 0, Math.cos(me.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      pos = me.pos.clone().addScaledVector(fwd, portrait ? -3.6 : -2.7).addScaledVector(right, portrait ? 0.7 : 1.05).setY(portrait ? 2.3 : 2.0);
      look = (opp ? opp.pos.clone() : me.pos.clone().addScaledVector(fwd, 1.5)).setY(1.2);
      if (this.slowmo && opp) {
        // Dramatic side angle during slow motion, framing both fighters and the launch.
        const mid = me.pos.clone().add(opp.pos).multiplyScalar(0.5);
        pos = mid.clone().addScaledVector(right, 3.4).setY(1.6);
        look = opp.pos.clone().setY(1.3 + (opp.snap.y ?? 0) * 0.6);
      }
    }
    this.arena.setCamera(pos, look, dt);
    void s;
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
    name.textContent = f.name + (f.bot ? ' 🤖' : '') + (f.pr || f.bot ? '' : ' (not in frame)');
    const hp = $(`${p}-hp`) as HTMLElement;
    hp.style.width = `${f.hp}%`;
    hp.classList.toggle('low', f.hp < 30);
    ($(`${p}-hp-lag`) as HTMLElement).style.width = `${f.hp}%`;
    ($(`${p}-meter`) as HTMLElement).style.width = `${f.meter}%`;
    const meter = $(`${p}-meter`).parentElement!;
    meter.classList.toggle('full', f.meter >= 100);
    $(`${p}-meter-label`).textContent = f.meter >= 100 ? 'SUPER READY' : 'SUPER';
    const pips = $(`${p}-pips`);
    const want = this.snap && this.snap.f.length <= 2 ? `${'<span class="pip won"></span>'.repeat(f.rw)}${'<span class="pip"></span>'.repeat(Math.max(0, 2 - f.rw))}` : `${f.kos} KO · ${f.kb}%`;
    if (pips.innerHTML !== want) pips.innerHTML = want;
  }

  dispose() {
    for (const s of this.slots.values()) s.avatar.dispose();
    this.slots.clear();
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
