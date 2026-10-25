// Smash-style hero fighter: KayKit Adventurers (CC0) characters with real animation clips.
// Legs and root always come from the locomotion state machine (driven by actual ground velocity), so fighters
// walk and run instead of drifting. The player's pose is layered on the spine, chest, head and arms.
// Attacks and reactions blend in authored clips (bots, remote fighters) or exaggerate the live pose (local player).
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { J, type Joints, type V3 } from '../../../shared/joints';
import type { FighterStyle } from './avatar';

export const HERO_MODELS = ['knight', 'barbarian', 'mage', 'rogue', 'rogue-hooded'] as const;
export type HeroModel = (typeof HERO_MODELS)[number];

const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<GLTF>>();
let animCache: Promise<THREE.AnimationClip[]> | null = null;

function loadGltf(url: string) {
  let p = modelCache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    modelCache.set(url, p);
  }
  return p;
}

export function preloadHeroes(onProgress?: (f: number) => void): Promise<void> {
  const urls = ['/characters/kaykit-animations.glb', ...HERO_MODELS.map((m) => `/characters/kaykit-${m}.glb`)];
  let done = 0;
  return Promise.all(
    urls.map((u) =>
      loadGltf(u).then(() => {
        done++;
        onProgress?.(done / urls.length);
      }),
    ),
  ).then(() => {});
}

function clips(): Promise<THREE.AnimationClip[]> {
  if (!animCache) animCache = loadGltf('/characters/kaykit-animations.glb').then((g) => g.animations);
  return animCache;
}

const PROPS = /Sword|Shield|Axe|Mug|Wand|Staff|Spellbook|Knife|Crossbow|Throwable/;
const SCALE = 0.62; // KayKit heroes are ~2.25 m chibis; this makes them ~1.4 m, big-headed and readable
// Native ground speed of the in-place clips at SCALE (m/s), used to scale playback so feet don't slide.
const WALK_SPEED = 1.15;
const RUN_SPEED = 3.1;

/** Three-step toon ramp. */
let toonRamp: THREE.DataTexture | null = null;
function ramp() {
  if (!toonRamp) {
    const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
    toonRamp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}

/** Inverted-hull outline material that pushes vertices out along normals (works with skinning). */
function outlineMaterial(color = 0x05060c, width = 0.018) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `transformed += normalize(objectNormal) * ${width.toFixed(4)};\n#include <project_vertex>`);
  };
  return m;
}

type ActionName = 'idle' | 'walk' | 'walkBack' | 'run' | 'strafeL' | 'strafeR' | 'punchA' | 'punchB' | 'kick' | 'hitA' | 'hitB' | 'blockHit' | 'block' | 'death' | 'lie' | 'getUp' | 'airborne' | 'land' | 'cheer' | 'cast';
const CLIP: Record<ActionName, string> = {
  idle: 'Unarmed_Idle',
  walk: 'Walking_A',
  walkBack: 'Walking_Backwards',
  run: 'Running_A',
  strafeL: 'Running_Strafe_Left',
  strafeR: 'Running_Strafe_Right',
  punchA: 'Unarmed_Melee_Attack_Punch_A',
  punchB: 'Unarmed_Melee_Attack_Punch_B',
  kick: 'Unarmed_Melee_Attack_Kick',
  hitA: 'Hit_A',
  hitB: 'Hit_B',
  blockHit: 'Block_Hit',
  block: 'Blocking',
  death: 'Death_A',
  lie: 'Lie_Idle',
  getUp: 'Lie_StandUp',
  airborne: 'Jump_Idle',
  land: 'Jump_Land',
  cheer: 'Cheer',
  cast: 'Spellcast_Shoot',
};
const LOCO: ActionName[] = ['idle', 'walk', 'walkBack', 'run', 'strafeL', 'strafeR'];

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class HeroFighter {
  root = new THREE.Group(); // world position + yaw (set by the view)
  body = new THREE.Group(); // local offsets: airborne height, tumble, flinch
  ready: Promise<void>;
  style: FighterStyle;
  glowBoost = 0;
  private model!: THREE.Object3D;
  private mixer!: THREE.AnimationMixer;
  private actions = new Map<ActionName, THREE.AnimationAction>();
  private bones: Record<string, THREE.Object3D | undefined> = {};
  private loco = new Map<ActionName, number>(); // current locomotion weights
  private oneShot: { name: ActionName; until: number; overrideArms: number } | null = null;
  private lastPos = new THREE.Vector3();
  private vel = new THREE.Vector2(); // local ground velocity (x = right, y = forward), smoothed
  private materials: THREE.MeshToonMaterial[] = [];
  private ring!: THREE.Mesh;
  private ringMat!: THREE.MeshBasicMaterial;
  private shadow!: THREE.Mesh;
  private shield!: THREE.Mesh;
  private shieldMat!: THREE.ShaderMaterial;
  private targetRing!: THREE.Mesh;
  private gloveL!: THREE.Mesh;
  private gloveR!: THREE.Mesh;
  private gloveMat!: THREE.MeshToonMaterial;
  private joints: Joints | null = null;
  private poseWeight = 0;
  private flinch = 0;
  private flinchDir = new THREE.Vector3();
  private tumble = 0;
  private wasAirborne = false;
  private wasAlive = true;
  private koTime = -1;
  private time = 0;
  private lastAtkKey = '';
  /** true when this fighter's arms follow a live pose (local or networked human). */
  livePose = false;
  /** Distance to the platform edge (m), set by the view: near the edge the fighter teeters. */
  edgeDist = 99;
  modelName: HeroModel;

  constructor(style: FighterStyle, modelName: HeroModel) {
    this.style = style;
    this.modelName = modelName;
    this.root.add(this.body);
    this.ready = this.load();
  }

  private async load() {
    const [gltf, anims] = await Promise.all([loadGltf(`/characters/kaykit-${this.modelName}.glb`), clips()]);
    const model = SkeletonUtils.clone(gltf.scene);
    model.scale.setScalar(SCALE);
    this.model = model;
    const tint = new THREE.Color(this.style.color);
    const outlineMat = outlineMaterial();
    const outlines: THREE.Object3D[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (PROPS.test(mesh.name)) {
        mesh.visible = false;
        return;
      }
      mesh.frustumCulled = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const toon = new THREE.MeshToonMaterial({ map: src.map ?? null, gradientMap: ramp(), color: 0xffffff });
      toon.userData.isSuit = /Body|Arm|Leg|Cape/.test(mesh.name);
      if (toon.userData.isSuit) toon.color.copy(new THREE.Color(1, 1, 1).lerp(tint, 0.55));
      this.materials.push(toon);
      mesh.material = toon;
      // Outline hull: a second draw of the same (skinned) geometry, back faces only, pushed outward.
      const SkinnedCtor = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? THREE.SkinnedMesh : THREE.Mesh;
      const hull = new SkinnedCtor(mesh.geometry, outlineMat) as THREE.Mesh;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) (hull as THREE.SkinnedMesh).bind((mesh as THREE.SkinnedMesh).skeleton, (mesh as THREE.SkinnedMesh).bindMatrix);
      hull.frustumCulled = false;
      hull.name = mesh.name + '_outline';
      outlines.push(hull);
      (hull as any).__parent = mesh.parent;
    });
    for (const h of outlines) ((h as any).__parent as THREE.Object3D).add(h);
    const names: Record<string, string> = { hips: 'hips', spine: 'spine', chest: 'chest', head: 'head', ual: 'upperarml', lal: 'lowerarml', wl: 'wristl', uar: 'upperarmr', lar: 'lowerarmr', wr: 'wristr', hl: 'handl', hr: 'handr' };
    for (const [k, n] of Object.entries(names)) this.bones[k] = model.getObjectByName(n);
    this.body.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clipName] of Object.entries(CLIP) as [ActionName, string][]) {
      const clip = anims.find((c) => c.name === clipName);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (!LOCO.includes(name)) {
        a.setLoop(name === 'lie' || name === 'block' || name === 'airborne' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        a.clampWhenFinished = true;
      }
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions.set(name, a);
    }
    this.actions.get('idle')?.setEffectiveWeight(1);
    this.loco.set('idle', 1);
    this.addGear();
  }

  private addGear() {
    const glow = new THREE.Color(this.style.aura ?? this.style.color);
    // Blob shadow
    const sh = new THREE.CanvasTexture(radial('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'));
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);
    // Team ring under the feet (brightens when the super meter is full)
    this.ringMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.015;
    this.root.add(this.ring);
    // Fists: glowing gloves on the hand slots (we fight unarmed)
    this.gloveMat = new THREE.MeshToonMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.35, gradientMap: ramp() });
    const gl = new THREE.SphereGeometry(0.075 / SCALE, 16, 12);
    this.gloveL = new THREE.Mesh(gl, this.gloveMat);
    this.gloveR = new THREE.Mesh(gl, this.gloveMat);
    this.bones.hl?.add(this.gloveL);
    this.bones.hr?.add(this.gloveR);
    // Shield bubble: fresnel rim only, visible only while the Shield super is active
    this.shieldMat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0x66ccff) }, time: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform vec3 color; uniform float time; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.-abs(dot(vN,vV)),3.); float hex = 0.6+0.4*sin(time*6.); gl_FragColor = vec4(color*f*1.6*hex, f*0.9); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 20), this.shieldMat);
    this.shield.position.y = 0.75;
    this.shield.visible = false;
    this.body.add(this.shield);
    // Target lock (Brawl)
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.64, 40), new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.position.y = 0.02;
    this.targetRing.visible = false;
    this.root.add(this.targetRing);
  }

  applyStyle(style: FighterStyle) {
    this.style = style;
    const tint = new THREE.Color(style.color);
    for (const m of this.materials) if (m.userData.isSuit) m.color.copy(new THREE.Color(1, 1, 1).lerp(tint, 0.55));
    const glow = new THREE.Color(style.aura ?? style.color);
    this.ringMat?.color.copy(glow);
    if (this.gloveMat) {
      this.gloveMat.color.copy(glow);
      this.gloveMat.emissive.copy(glow);
    }
  }

  setTargeted(on: boolean) {
    if (this.targetRing) this.targetRing.visible = on;
  }
  setSeeThroughCape(_on: boolean) {}

  setJoints(j: Joints | null) {
    this.joints = j;
  }

  flinchFrom(dirWorld: THREE.Vector3, amount: number) {
    this.flinch = Math.min(1, this.flinch + amount);
    this.flinchDir.copy(dirWorld).setY(0).normalize();
    if (amount >= 0.6) this.play(Math.random() < 0.5 ? 'hitA' : 'hitB', 0.06, this.livePose ? 0.55 : 1);
    else if (amount > 0) this.play('blockHit', 0.05, 0.4);
  }

  /** Play a one-shot clip on top of locomotion. overrideArms: how much the clip beats the live pose (0..1). */
  private play(name: ActionName, fade = 0.08, overrideArms = 1) {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.oneShot && this.oneShot.name !== name) this.actions.get(this.oneShot.name)?.fadeOut(fade);
    a.reset();
    a.setEffectiveTimeScale(1);
    a.setEffectiveWeight(1);
    a.fadeIn(fade);
    a.play();
    this.oneShot = { name, until: this.time + a.getClip().duration * 0.9, overrideArms };
  }

  /** Strike started (from the simulation): wind-up/extension/recoil via clips or pose exaggeration. */
  attack(kind: string, hand: string, key: string) {
    if (key === this.lastAtkKey) return;
    this.lastAtkKey = key;
    if (kind === 'kick') return this.play('kick', 0.05, 1);
    if (kind === 'blast') return this.play('cast', 0.05, this.livePose ? 0.4 : 1);
    if (this.livePose) {
      // The player's own arm is the punch; add the body: a quick twist and lunge.
      this.glowBoost = 0.8;
      this.punchTwist = hand === 'L' ? 1 : -1;
      this.punchTwistT = 0;
      return;
    }
    this.play(kind === 'uppercut' || kind === 'super_uppercut' || hand === 'R' ? 'punchB' : 'punchA', 0.05, 1);
  }
  private punchTwist = 0;
  private punchTwistT = 1;

  update(dt: number, time: number, opts: { shield: number; meterFull: boolean; airborne: number; alive: boolean; blocking?: boolean }) {
    this.time = time;
    if (!this.mixer) return;
    // ---- ground velocity in the fighter's local frame (from the root's actual motion) ----
    const pos = this.root.position;
    const d = _v.copy(pos).sub(this.lastPos);
    this.lastPos.copy(pos);
    if (dt > 0 && d.lengthSq() < 4) {
      const yaw = this.root.rotation.y;
      const fwd = d.x * Math.sin(yaw) + d.z * Math.cos(yaw);
      const right = -(d.x * Math.cos(yaw) - d.z * Math.sin(yaw));
      const k = 1 - Math.exp(-dt * 12);
      this.vel.x += (right / dt - this.vel.x) * k;
      this.vel.y += (fwd / dt - this.vel.y) * k;
    }
    const speed = this.vel.length();
    const airborne = opts.airborne > 0.05;

    // ---- KO / get-up ----
    if (!opts.alive && this.wasAlive) {
      this.play('death', 0.08, 1);
      this.koTime = time;
    }
    if (opts.alive && !this.wasAlive) {
      this.actions.get('death')?.fadeOut(0.1);
      this.actions.get('lie')?.fadeOut(0.1);
      this.play('getUp', 0.1, 1);
      this.koTime = -1;
    }
    this.wasAlive = opts.alive;
    if (this.koTime >= 0 && time - this.koTime > 0.8 && this.oneShot?.name === 'death') this.play('lie', 0.2, 1);

    // ---- airborne: tumble in the air, land with a squash ----
    if (airborne && !this.wasAirborne) this.play('airborne', 0.08, 1);
    if (!airborne && this.wasAirborne) {
      this.play('land', 0.05, 1);
      this.tumble = 0;
    }
    this.wasAirborne = airborne;
    if (airborne) this.tumble += dt * 7;

    // ---- locomotion weights (legs never translate without animating) ----
    const target = new Map<ActionName, number>();
    LOCO.forEach((n) => target.set(n, 0));
    let rate = 1;
    if (speed < 0.18) target.set('idle', 1);
    else {
      const ax = Math.abs(this.vel.x);
      const fwd = this.vel.y;
      if (ax > Math.abs(fwd) * 1.2 && speed > 0.6) {
        target.set(this.vel.x > 0 ? 'strafeR' : 'strafeL', 1);
        rate = THREE.MathUtils.clamp(speed / RUN_SPEED, 0.4, 1.8);
      } else if (fwd < -0.15) {
        target.set('walkBack', 1);
        rate = THREE.MathUtils.clamp(speed / WALK_SPEED, 0.4, 2);
      } else if (speed < 1.9) {
        const w = THREE.MathUtils.clamp((speed - 0.18) / 0.5, 0, 1);
        target.set('walk', w);
        target.set('idle', 1 - w);
        rate = THREE.MathUtils.clamp(speed / WALK_SPEED, 0.5, 1.8);
      } else {
        target.set('run', 1);
        rate = THREE.MathUtils.clamp(speed / RUN_SPEED, 0.6, 1.6);
      }
    }
    const oneShotActive = this.oneShot && time < this.oneShot.until;
    const oneShotFull = oneShotActive && ['death', 'lie', 'getUp', 'airborne', 'land', 'kick'].includes(this.oneShot!.name);
    const k = 1 - Math.exp(-dt * 10);
    for (const n of LOCO) {
      const a = this.actions.get(n);
      if (!a) continue;
      const cur = this.loco.get(n) ?? 0;
      const next = cur + ((oneShotFull ? 0 : target.get(n)!) - cur) * k;
      this.loco.set(n, next);
      a.setEffectiveWeight(next);
      if (n !== 'idle') a.setEffectiveTimeScale(rate);
    }
    if (this.oneShot && !oneShotActive && !['lie', 'airborne'].includes(this.oneShot.name)) {
      this.actions.get(this.oneShot.name)?.fadeOut(0.15);
      this.oneShot = null;
    }
    // Blocking without a live pose: blocking loop on top.
    const blockA = this.actions.get('block');
    if (blockA) blockA.setEffectiveWeight(THREE.MathUtils.lerp(blockA.getEffectiveWeight(), opts.blocking && !this.livePose ? 1 : 0, k));

    this.mixer.update(dt);

    // ---- live pose layered on torso, head and arms ----
    const wantPose = this.livePose && this.joints && opts.alive && !oneShotFull ? (oneShotActive ? 1 - (this.oneShot!.overrideArms ?? 1) : 1) : 0;
    this.poseWeight += (wantPose - this.poseWeight) * (1 - Math.exp(-dt * 14));
    if (this.joints && this.poseWeight > 0.01) this.applyPose(this.joints, this.poseWeight);

    // Punch body motion for live-pose fighters: twist toward the punching side and lunge, then recoil.
    if (this.punchTwistT < 1) {
      this.punchTwistT += dt / 0.28;
      const c = Math.sin(Math.min(1, this.punchTwistT) * Math.PI);
      const spine = this.bones.spine;
      if (spine) spine.quaternion.multiply(_q.setFromAxisAngle(_v2.set(0, 1, 0), -this.punchTwist * 0.35 * c));
      const hips = this.bones.hips;
      if (hips) hips.quaternion.multiply(_q.setFromAxisAngle(_v2.set(1, 0, 0), 0.12 * c));
      this.body.position.z = 0.12 * c;
    } else this.body.position.z *= 0.8;

    // ---- teeter: near the edge on the ground, flail the arms and wobble ----
    if (opts.alive && !airborne && this.edgeDist < 0.45 && this.edgeDist > -0.2) {
      const t2 = time * 14;
      for (const [b, sgn] of [[this.bones.ual, 1], [this.bones.uar, -1]] as const) if (b) b.quaternion.multiply(_q.setFromAxisAngle(_v2.set(0, 0, 1), sgn * (1.1 + 0.5 * Math.sin(t2 + sgn))));
      if (this.bones.spine) this.bones.spine.quaternion.multiply(_q.setFromAxisAngle(_v2.set(1, 0, 0), 0.25 * Math.sin(time * 9)));
    }

    // ---- body offsets: airborne height, tumble, flinch ----
    this.flinch = Math.max(0, this.flinch - dt * 3.5);
    const local = this.flinchDir.clone().applyQuaternion(this.root.quaternion.clone().invert());
    this.body.position.x = local.x * this.flinch * 0.15;
    this.body.position.y = opts.airborne;
    this.body.rotation.x = airborne ? -this.tumble : -this.flinch * 0.3 * Math.sign(local.z || 1);

    // ---- gear ----
    this.glowBoost = Math.max(0, this.glowBoost - dt * 3);
    if (this.gloveMat) this.gloveMat.emissiveIntensity = 0.35 + this.glowBoost * 2 + (opts.meterFull ? 0.5 + 0.3 * Math.sin(time * 8) : 0);
    if (this.ringMat) {
      this.ringMat.opacity = opts.meterFull ? 0.75 + 0.25 * Math.sin(time * 8) : 0.4;
      this.ring.scale.setScalar(opts.meterFull ? 1.1 + 0.05 * Math.sin(time * 8) : 1);
    }
    if (this.shield) {
      this.shield.visible = opts.shield > 0;
      this.shieldMat.uniforms.time.value = time;
    }
    const sh = THREE.MathUtils.clamp(1 - opts.airborne / 3, 0.25, 1);
    this.shadow.scale.setScalar(sh);
    this.root.visible = opts.alive || this.koTime >= 0;
  }

  /** Rotate torso/head/arm bones toward the player's joints (swing only), blended by weight. */
  private applyPose(j: Joints, w: number) {
    const P = j.p.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const toWorld = (v: THREE.Vector3) => v.clone().applyQuaternion(rootQ);
    // Torso: rotate the chest so its shoulder line matches the player's.
    const chest = this.bones.chest;
    const ual = this.bones.ual;
    const uar = this.bones.uar;
    if (chest && ual && uar) {
      chest.updateWorldMatrix(true, false);
      const cur = ual.getWorldPosition(new THREE.Vector3()).sub(uar.getWorldPosition(new THREE.Vector3())).normalize();
      const want = toWorld(P[J.lSh].clone().sub(P[J.rSh])).normalize();
      // Lean: tilt the chest toward the player's torso up vector.
      const curUp = new THREE.Vector3(0, 1, 0).applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion()));
      const mh = P[J.lHip].clone().add(P[J.rHip]).multiplyScalar(0.5);
      const ms = P[J.lSh].clone().add(P[J.rSh]).multiplyScalar(0.5);
      const wantUp = toWorld(ms.sub(mh)).normalize();
      rotateBoneTowards(chest, cur, want, w * 0.8);
      chest.updateWorldMatrix(true, false);
      rotateBoneTowards(chest, curUp, wantUp, w * 0.5);
    }
    // Head: turn toward the player's facing (nose relative to ears).
    const head = this.bones.head;
    if (head) {
      head.updateWorldMatrix(true, false);
      const me = P[J.lEar].clone().add(P[J.rEar]).multiplyScalar(0.5);
      const wantFwd = toWorld(P[J.nose].clone().sub(me).setY(0)).normalize();
      const curFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
      if (wantFwd.lengthSq() > 0.5 && curFwd.lengthSq() > 0.5) rotateBoneTowards(head, curFwd, wantFwd, w * 0.7);
    }
    // Arms: upper arm toward the elbow, forearm toward the wrist.
    for (const side of ['l', 'r'] as const) {
      const ua = this.bones['ua' + side];
      const la = this.bones['la' + side];
      const wr = this.bones['w' + side];
      if (!ua || !la || !wr) continue;
      const S = side === 'l' ? P[J.lSh] : P[J.rSh];
      const E = side === 'l' ? P[J.lEl] : P[J.rEl];
      const W = side === 'l' ? P[J.lWr] : P[J.rWr];
      ua.updateWorldMatrix(true, false);
      const curU = la.getWorldPosition(new THREE.Vector3()).sub(ua.getWorldPosition(new THREE.Vector3())).normalize();
      rotateBoneTowards(ua, curU, toWorld(E.clone().sub(S)).normalize(), w);
      la.updateWorldMatrix(true, false);
      const curL = wr.getWorldPosition(new THREE.Vector3()).sub(la.getWorldPosition(new THREE.Vector3())).normalize();
      rotateBoneTowards(la, curL, toWorld(W.clone().sub(E)).normalize(), w);
    }
  }

  glovePos(side: 'L' | 'R', out = new THREE.Vector3()) {
    const g = side === 'L' ? this.gloveL : this.gloveR;
    if (g) g.getWorldPosition(out);
    else this.root.getWorldPosition(out).setY(1);
    return out;
  }

  probe() {
    const w = (o: THREE.Object3D | null | undefined) => (o ? o.getWorldPosition(new THREE.Vector3()).toArray() : null);
    const q = (o: THREE.Object3D | null | undefined) => (o ? o.getWorldQuaternion(new THREE.Quaternion()).toArray() : null);
    return { root: w(this.root), lFoot: w(this.model?.getObjectByName('footl')), rFoot: w(this.model?.getObjectByName('footr')), chest: q(this.bones.chest), head: q(this.bones.head) };
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}

/** Rotate a bone (in world space) so that direction `from` turns toward `to`, by fraction w. */
function rotateBoneTowards(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, w: number) {
  if (from.lengthSq() < 1e-6 || to.lengthSq() < 1e-6) return;
  const delta = _q.setFromUnitVectors(from, to);
  if (w < 1) delta.slerp(_q2.identity(), 1 - w);
  const parent = bone.parent!;
  const parentQ = parent.getWorldQuaternion(new THREE.Quaternion());
  const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const newWorld = delta.multiply(boneQ);
  bone.quaternion.copy(parentQ.invert().multiply(newWorld));
  bone.updateMatrixWorld(true);
}

function radial(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export type { V3 };
