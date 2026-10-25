// Hero fighter: human-proportioned toon fighters (Quaternius Universal Base Characters + Universal Animation
// Library, CC0). Legs and root come from a locomotion state machine driven by the actual ground velocity (walk,
// jog, walk back; circling turns the hips toward the motion while the chest keeps facing the opponent), so
// fighters never drift. The player's live pose is layered on the chest, head and arms. Strikes play authored
// clips and a two-bone IK pulls the fist (or foot) onto the target on the contact frame, with a step-in lunge
// when the target is out of arm's reach, so hits visibly connect.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { J, type Joints, type V3 } from '../../../shared/joints';
import type { FighterStyle } from './avatar';

/** Body + build per roster slot: distinct silhouettes from body type, skin tone and build. */
export const HERO_MODELS = ['male_light', 'female_dark', 'male_dark:heavy', 'female_light', 'male_light:heavy', 'female_dark:lean', 'male_dark', 'female_light:lean'] as const;
export type HeroModel = (typeof HERO_MODELS)[number];
const BODIES = ['male_light', 'male_dark', 'female_light', 'female_dark'];
/** Per-slot look so every fighter reads differently even at Brawl scale: top, leg wear, hair or headgear. */
type Look = { top: 0 | 1 | 2; pants: boolean; head: 'short' | 'bun' | 'headgear' | 'mohawk' | 'long' | 'none'; hair: number };
// The user preferred the plain fighters (no added hair, headgear, tops or pants): looks are off for every slot.
const LOOKS: Look[] = [{ top: 0, pants: false, head: 'none', hair: 0 }];
const BUILD: Record<string, [number, number]> = { '': [1, 1], heavy: [1.03, 1.12], lean: [0.98, 0.94] }; // [height, width]

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const modelCache = new Map<string, Promise<GLTF>>();
const ANIM_URL = '/characters/th-animations.glb';
const bodyUrl = (b: string) => `/characters/th-${b}.glb`;

function loadGltf(url: string) {
  let p = modelCache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    modelCache.set(url, p);
  }
  return p;
}

export function preloadHeroes(onProgress?: (f: number) => void): Promise<void> {
  const urls = [ANIM_URL, ...BODIES.map(bodyUrl)];
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

const ARM = /^(clavicle|upperarm|lowerarm|hand|index|middle|pinky|ring|thumb)_/;
const boneOf = (track: THREE.KeyframeTrack) => track.name.slice(0, track.name.lastIndexOf('.'));

/** Static pose of the matching bones at time t of a clip, as 2-key tracks. */
function poseTracks(clip: THREE.AnimationClip, t: number, match: RegExp) {
  const out: THREE.KeyframeTrack[] = [];
  for (const tr of clip.tracks) {
    if (!match.test(boneOf(tr)) || !tr.name.endsWith('.quaternion')) continue;
    const v = Array.from((tr as any).createInterpolant().evaluate(t) as Float32Array);
    out.push(new THREE.QuaternionKeyframeTrack(tr.name, [0, 1], [...v, ...v]));
  }
  return out;
}

/** Clip with its arm tracks replaced (fighters walk with their guard up). */
function withArms(clip: THREE.AnimationClip, arms: THREE.KeyframeTrack[], name: string) {
  const tracks = clip.tracks.filter((t) => !ARM.test(boneOf(t))).map((t) => t.clone());
  return new THREE.AnimationClip(name, clip.duration, [...tracks, ...arms.map((t) => t.clone())]);
}

let clipSet: Promise<Map<string, THREE.AnimationClip>> | null = null;
function buildClips(): Promise<Map<string, THREE.AnimationClip>> {
  if (clipSet) return clipSet;
  clipSet = loadGltf(ANIM_URL).then((g) => {
    const src = g.animations;
    const get = (n: string) => {
      const c = src.find((x) => x.name === n);
      if (!c) throw new Error('missing clip ' + n);
      // Keep rotations everywhere, translation only on root/pelvis (each body keeps its own bone lengths).
      const k = c.clone();
      k.tracks = k.tracks.filter((t) => !t.name.endsWith('.position') || /^(root|pelvis)$/.test(boneOf(t)));
      return k;
    };
    const jab = get('Punch_Jab');
    const guard = poseTracks(jab, 0, ARM);
    const m = new Map<string, THREE.AnimationClip>();
    m.set('idle', withArms(get('Idle_Loop'), guard, 'idle'));
    m.set('walk', withArms(get('Walk_Loop'), guard, 'walk'));
    m.set('run', withArms(get('Jog_Fwd_Loop'), guard, 'run'));
    m.set('jab', jab);
    m.set('cross', get('Punch_Cross'));
    m.set('hitHead', get('Hit_Head'));
    m.set('hitChest', get('Hit_Chest'));
    m.set('knockback', get('Hit_Knockback'));
    m.set('death', get('Death01'));
    m.set('getUp', get('LayToIdle'));
    m.set('airborne', get('Jump_Loop'));
    m.set('land', get('Jump_Land'));
    m.set('cheer', get('Dance_Loop'));
    m.set('cast', get('Spell_Simple_Shoot'));
    m.set('dizzy', get('Idle_No_Loop')); // upright, head shaking; a sway is layered on top
    m.set('blockHit', get('Hit_Chest'));
    return m;
  });
  return clipSet;
}

const _qp = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
// Native ground speed of the in-place clips (m/s), measured from the stance foot: playback scales to the
// fighter's real speed so planted feet stay planted.
const WALK_SPEED = Number(_qp.get('walkspeed') ?? 0.84);
const RUN_SPEED = Number(_qp.get('runspeed') ?? 2.6);

/** Three-step toon ramp. */
let toonRamp: THREE.DataTexture | null = null;
function ramp() {
  if (!toonRamp) {
    const d = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
    toonRamp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}

/** Inverted-hull outline material that pushes vertices out along normals (works with skinning). */
function outlineMaterial(color = 0x05060c, width = 0.012) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `transformed += normal * ${width.toFixed(4)};\n#include <project_vertex>`);
  };
  return m;
}

/** Toon skin material; grey/white cloth in the texture (shorts, sports top) takes the fighter's color. A tank top or
 *  rash guard and fight pants are painted by bind-pose position (metres: y up, arms along x in the T-pose). */
function bodyMaterial(map: THREE.Texture | null, tint: THREE.Color, look: Look) {
  const m = new THREE.MeshToonMaterial({ map, gradientMap: ramp(), color: 0xffffff });
  m.userData.tint = { value: tint.clone() };
  const dark = { value: tint.clone().multiplyScalar(0.35) };
  m.userData.dark = dark;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTint = m.userData.tint;
    sh.uniforms.uDark = dark;
    sh.uniforms.uTop = { value: look.top };
    sh.uniforms.uPants = { value: look.pants ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vObj;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec3 uTint; uniform vec3 uDark; uniform float uTop; uniform float uPants; varying vec3 vObj;\nvoid main() {').replace(
      '#include <map_fragment>',
      `#include <map_fragment>
        { vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b));
          float sat = mx > 0.001 ? (mx - mn) / mx : 0.; float cloth = 1. - smoothstep(0.10, 0.2, sat);
          c = mix(c, uTint * (0.45 + 0.75 * mx), cloth);
          float top = 0.;
          if (uTop > 0.5) { float xw = uTop > 1.5 ? 0.66 : 0.19; top = (1. - step(xw, abs(vObj.x))) * step(0.97, vObj.y) * (1. - step(1.47, vObj.y)); }
          float pants = uPants > 0.5 ? (1. - step(0.97, vObj.y)) * step(0.1, vObj.y) : 0.;
          c = mix(c, uTint * 0.95, top);
          c = mix(c, uDark, pants * (1. - cloth));
          diffuseColor.rgb = c; }`,
    );
  };
  return m;
}

type Strike = { kind: string; hand: 'L' | 'R'; t0: number; contactT: number; target: HeroFighter | null; lunge: number; recorded: boolean };

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const BLUE = new THREE.Color(0x55bbff);
const YELLOW = new THREE.Color(0xffe14d);
const RED = new THREE.Color(0xff3344);

export class HeroFighter {
  root = new THREE.Group(); // world position + yaw (set by the view)
  body = new THREE.Group(); // local offsets: airborne height, tumble, flinch, lunge
  ready: Promise<void>;
  style: FighterStyle;
  glowBoost = 0;
  private model!: THREE.Object3D;
  private mixer!: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  bones: Record<string, THREE.Object3D | undefined> = {};
  private len: Record<string, number> = {};
  private loco = { idle: 1, walk: 0, run: 0 };
  private oneShot: { name: string; until: number; overrideArms: number } | null = null;
  private lastPos = new THREE.Vector3();
  private vel = new THREE.Vector2(); // local ground velocity (x = right, y = forward), smoothed
  private lowerYaw = 0; // hips turned toward the direction of travel (radians)
  private materials: THREE.MeshToonMaterial[] = [];
  private ring!: THREE.Mesh;
  private ringMat!: THREE.MeshBasicMaterial;
  private shadow!: THREE.Mesh;
  private shield!: THREE.Mesh;
  private shieldMat!: THREE.ShaderMaterial;
  private targetRing!: THREE.Mesh;
  private stars = new THREE.Group();
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
  private strike: Strike | null = null;
  private lungeNow = 0;
  /** Fist/foot-to-target distance (m) on each contact frame (review-loop metric: under 0.10). */
  contacts: { kind: string; d: number; t: number }[] = [];
  /** true when this fighter's arms follow a live pose (local or networked human). */
  livePose = false;
  edgeDist = 99;
  modelName: HeroModel;
  private look: Look;
  private hairGroup: THREE.Object3D | null = null;

  constructor(style: FighterStyle, modelName: HeroModel) {
    this.style = style;
    this.modelName = modelName;
    this.look = LOOKS[Math.max(0, HERO_MODELS.indexOf(modelName)) % LOOKS.length];
    this.root.add(this.body);
    this.ready = this.load();
  }

  private async load() {
    const [bodyName, build = ''] = this.modelName.split(':');
    const [gltf, clips] = await Promise.all([loadGltf(bodyUrl(bodyName)), buildClips()]);
    const model = SkeletonUtils.clone(gltf.scene);
    const [hs, ws] = BUILD[build] ?? [1, 1];
    model.scale.set(ws, hs, ws);
    this.model = model;
    const tint = new THREE.Color(this.style.color);
    const outlineMat = outlineMaterial();
    const outlines: THREE.Object3D[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const isBody = /Superhero/.test(src.name ?? '');
      const toon = isBody ? bodyMaterial(src.map ?? null, tint, this.look) : new THREE.MeshToonMaterial({ map: src.map ?? null, gradientMap: ramp(), color: 0xffffff });
      toon.userData.isBody = isBody;
      this.materials.push(toon);
      mesh.material = toon;
      if (!isBody || !(mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      // Outline hull: a second draw of the same skinned geometry, back faces only, pushed outward.
      const sk = mesh as THREE.SkinnedMesh;
      const hull = new THREE.SkinnedMesh(sk.geometry, outlineMat);
      hull.bind(sk.skeleton, sk.bindMatrix);
      hull.frustumCulled = false;
      hull.name = mesh.name + '_outline';
      outlines.push(hull);
      (hull as any).__parent = mesh.parent;
    });
    for (const h of outlines) ((h as any).__parent as THREE.Object3D).add(h);
    for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_l', 'ball_r'])
      this.bones[n] = model.getObjectByName(n);
    this.body.add(model);
    model.updateMatrixWorld(true);
    const wp = (n: string) => this.bones[n]!.getWorldPosition(new THREE.Vector3());
    for (const s of ['l', 'r']) {
      this.len['ua' + s] = wp('upperarm_' + s).distanceTo(wp('lowerarm_' + s));
      this.len['la' + s] = wp('lowerarm_' + s).distanceTo(wp('hand_' + s));
      this.len['th' + s] = wp('thigh_' + s).distanceTo(wp('calf_' + s));
      this.len['ca' + s] = wp('calf_' + s).distanceTo(wp('foot_' + s));
    }

    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of clips) {
      const a = this.mixer.clipAction(clip);
      if (!['idle', 'walk', 'run', 'dizzy', 'airborne'].includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions.set(name, a);
    }
    this.actions.get('idle')!.setEffectiveWeight(1);
    this.actions.get('idle')!.time = (this.modelName.length * 0.37) % 2.5; // desync breathing between fighters
    this.addGear();
  }

  private addGear() {
    const glow = new THREE.Color(this.style.aura ?? this.style.color);
    // Contact shadow
    const sh = new THREE.CanvasTexture(radial('rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'));
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);
    // Team ring under the feet (brightens when the super meter is full)
    this.ringMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.46, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.015;
    this.root.add(this.ring);
    // Boxing gloves, centered over the knuckles.
    this.gloveMat = new THREE.MeshToonMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.15, gradientMap: ramp() });
    const gl = new THREE.SphereGeometry(0.075, 18, 14);
    for (const s of ['l', 'r'] as const) {
      const hand = this.bones['hand_' + s];
      const fore = this.bones['lowerarm_' + s];
      if (!hand || !fore) continue;
      const g = new THREE.Mesh(gl, this.gloveMat);
      // Offset along the forearm direction, in the hand bone's local frame.
      const dirW = hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
      const handQ = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
      const ws = hand.getWorldScale(new THREE.Vector3());
      g.position.copy(dirW.applyQuaternion(handQ).multiplyScalar(0.07 / ws.x));
      g.scale.setScalar(1 / ws.x);
      g.add(new THREE.Mesh(gl, outlineMaterial(0x05060c, 0.01)));
      hand.add(g);
      if (s === 'l') this.gloveL = g;
      else this.gloveR = g;
    }
    this.addHead(glow);
    // Guard bubble: fresnel rim, visible only while guarding or during Iron Wall
    this.shieldMat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0x66ccff) }, time: { value: 0 }, strength: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform vec3 color; uniform float time; uniform float strength; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.-abs(dot(vN,vV)),3.); float hex = 0.85+0.15*sin(time*6.); gl_FragColor = vec4(color*(0.8+f*0.5)*hex, clamp((f*0.9+0.03)*strength, 0., 1.)); }`,
      transparent: true,
      depthWrite: false,
    });
    // Tight around the defender only (not a big sphere around both fighters).
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 20), this.shieldMat);
    this.shield.scale.set(1, 1.6, 1);
    this.shield.position.y = 0.97;
    this.shield.visible = false;
    this.body.add(this.shield);
    // Dizzy stars circling over the head (guard broken)
    const starTex = new THREE.CanvasTexture(starCanvas());
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xffe14d, depthWrite: false }));
      sp.scale.setScalar(0.13);
      this.stars.add(sp);
    }
    this.stars.visible = false;
    this.root.add(this.stars);
    // Target lock (Brawl)
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.64, 40), new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.position.y = 0.02;
    this.targetRing.visible = false;
    this.root.add(this.targetRing);
  }

  /** Hair or headgear, attached to the head bone (built in the bind pose, upright in world space). */
  private addHead(glow: THREE.Color) {
    const head = this.bones.Head;
    const L = this.look;
    if (!head || L.head === 'none') return;
    const g = new THREE.Group();
    const hairMat = new THREE.MeshToonMaterial({ color: L.hair, gradientMap: ramp() });
    const ol = outlineMaterial(0x05060c, 0.008);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...scale);
      m.add(new THREE.Mesh(geo, ol));
      g.add(m);
    };
    // Head bone origin is at the jaw; the crown is about 0.25 m above it, the brow about 0.15 m.
    const cap = new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    if (L.head === 'short') add(cap, hairMat, [0, 0.155, -0.012], [1, 0.95, 1.1]);
    else if (L.head === 'bun') {
      add(cap, hairMat, [0, 0.155, -0.012], [1.03, 1, 1.12]);
      add(new THREE.SphereGeometry(0.055, 12, 10), hairMat, [0, 0.21, -0.11]);
    } else if (L.head === 'long') {
      add(cap, hairMat, [0, 0.155, -0.012], [1.06, 1, 1.14]);
      add(new THREE.CapsuleGeometry(0.06, 0.16, 4, 10), hairMat, [0, 0.07, -0.1], [1.6, 1, 0.8]);
    } else if (L.head === 'mohawk') add(new THREE.BoxGeometry(0.03, 0.06, 0.2), hairMat, [0, 0.275, -0.012]);
    else if (L.head === 'headgear') {
      const gear = new THREE.MeshToonMaterial({ color: glow, gradientMap: ramp() });
      add(new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), gear, [0, 0.15, -0.012], [1.02, 1, 1.12]);
      add(new THREE.TorusGeometry(0.105, 0.02, 8, 20, Math.PI), gear, [0, 0.15, 0.0], [1, 1, 1.1]);
    }
    // Head bone origin is near the jaw: place relative to it in world space at bind, then parent to the bone.
    this.root.updateMatrixWorld(true);
    const hp = head.getWorldPosition(new THREE.Vector3());
    const ws = head.getWorldScale(new THREE.Vector3());
    this.body.add(g);
    g.position.copy(this.body.worldToLocal(hp.clone())); // upright in the fighter's frame, at the head bone
    g.updateMatrixWorld(true);
    head.attach(g);
    void ws;
    this.hairGroup = g;
  }

  applyStyle(style: FighterStyle) {
    this.style = style;
    const tint = new THREE.Color(style.color);
    for (const m of this.materials) if (m.userData.isBody) m.userData.tint.value.copy(tint);
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
    if (!this.wasAlive) return; // knocked out: the death clip keeps playing
    this.flinch = Math.min(1, this.flinch + amount);
    this.flinchDir.copy(dirWorld).setY(0).normalize();
    if (amount >= 0.6) this.play(amount >= 0.95 ? 'knockback' : Math.random() < 0.5 ? 'hitHead' : 'hitChest', 0.05, this.livePose ? 0.6 : 1);
    else if (amount > 0) this.play('blockHit', 0.05, 0.3, 0.6);
  }

  /** Play a one-shot clip on top of locomotion. overrideArms: how much the clip beats the live pose (0..1). */
  private play(name: string, fade = 0.08, overrideArms = 1, weight = 1, timeScale = 1) {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.oneShot && this.oneShot.name !== name) this.actions.get(this.oneShot.name)?.fadeOut(fade);
    a.reset();
    a.setEffectiveTimeScale(timeScale);
    a.setEffectiveWeight(weight);
    a.fadeIn(fade);
    a.play();
    this.oneShot = { name, until: this.time + (a.getClip().duration / timeScale) * 0.92, overrideArms };
  }

  /** Strike started (from the simulation). The clip gives the body motion; IK lands the fist on the target. */
  attack(kind: string, hand: string, key: string, target: HeroFighter | null = null) {
    if (key === this.lastAtkKey) {
      if (target && this.strike && !this.strike.target) this.strike.target = target;
      return;
    }
    this.lastAtkKey = key;
    const h: 'L' | 'R' = hand === 'L' ? 'L' : 'R';
    this.glowBoost = 0.6;
    if (kind === 'blast') {
      this.play('cast', 0.05, this.livePose ? 0.4 : 1);
      return;
    }
    // Contact time: live players already threw the punch (the recognizer fires near full extension), so the fist
    // snaps on quickly; authored clips reach full extension later.
    let contactT = 0.16;
    if (kind === 'kick') contactT = 0.24;
    else if (this.livePose) contactT = 0.07;
    else if (kind === 'jab') {
      this.play('jab', 0.05, 1, 1, 1.25);
      contactT = 0.15;
    } else {
      this.play('cross', 0.05, 1, 1, 1.3);
      contactT = kind === 'hook' ? 0.2 : 0.22;
    }
    this.strike = { kind, hand: h, t0: this.time, contactT, target, lunge: 0, recorded: false };
  }

  /** Seconds until the current strike's fist reaches its target (0 if none in progress). */
  contactDelay() {
    if (!this.strike) return 0;
    return Math.max(0, this.strike.t0 + this.strike.contactT - this.time);
  }

  /** World point the current strike aims at on the target (head for punches, chest for kicks). */
  private aimPoint(s: Strike, out: THREE.Vector3) {
    const t = s.target!;
    // Airborne/tumbling targets: aim at the chest (the head swings far around the body during a tumble).
    const airborne = t.body.position.y > 0.05 || Math.abs(t.body.rotation.x) > 0.3;
    const bone = s.kind === 'kick' || airborne ? t.bones.spine_02 : t.bones.Head;
    if (!bone) return null;
    bone.getWorldPosition(out);
    if (s.kind !== 'kick') out.y += 0.04;
    // Stop on the surface facing the attacker.
    const me = this.root.getWorldPosition(_v2);
    const dir = me.sub(out).setY(0).normalize();
    out.addScaledVector(dir, s.kind === 'kick' ? 0.14 : 0.11);
    return out;
  }

  update(dt: number, time: number, opts: { shield: number; meterFull: boolean; airborne: number; alive: boolean; blocking?: boolean; guard?: number; dizzy?: boolean; ironWall?: boolean }) {
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
      this.play('death', 0.05, 1, 1, 1.4);
      this.actions.get('death')!.time = 1.05; // Death01 staggers for ~1 s before the fall: start at the fall
      this.oneShot!.until = Infinity; // stay down (clamped on the last frame) until revived
      this.koTime = time;
    }
    if (opts.alive && !this.wasAlive) {
      this.actions.get('death')?.fadeOut(0.15);
      this.play('getUp', 0.12, 1, 1, 1.4);
      this.koTime = -1;
    }
    this.wasAlive = opts.alive;
    // While knocked out, the death clip (clamped on its last frame) always plays; nothing may replace it.
    if (!opts.alive && this.oneShot?.name !== 'death') {
      this.play('death', 0.05, 1, 1, 1.4);
      this.actions.get('death')!.time = 1.05;
      this.oneShot!.until = Infinity;
    }

    // ---- airborne: tumble in the air, land, get up ----
    if (airborne && !this.wasAirborne) this.play('airborne', 0.08, 1);
    if (!airborne && this.wasAirborne) {
      if (this.tumble > 2.5 && opts.alive) this.play('getUp', 0.06, 1, 1, 1.8);
      else this.play('land', 0.05, 1);
      this.tumble = 0;
    }
    this.wasAirborne = airborne;
    if (airborne) this.tumble += dt * 6;

    // ---- dizzy (guard broken): wobble loop ----
    const k = 1 - Math.exp(-dt * 10);
    const dizzyA = this.actions.get('dizzy');
    if (dizzyA) dizzyA.setEffectiveWeight(THREE.MathUtils.lerp(dizzyA.getEffectiveWeight(), opts.dizzy && opts.alive ? 1 : 0, k));

    // ---- locomotion: idle / walk / jog, hips turned toward the travel direction ----
    let target = { idle: 1, walk: 0, run: 0 };
    let rate = 1;
    let wantYaw = 0;
    if (speed >= 0.15) {
      // Travel angle relative to facing: 0 = forward, ±π/2 = sideways, π = backward.
      let ang = Math.atan2(-this.vel.x, this.vel.y);
      let back = false;
      if (Math.abs(ang) > Math.PI * 0.6) {
        back = true;
        ang = ang > 0 ? ang - Math.PI : ang + Math.PI;
      }
      wantYaw = THREE.MathUtils.clamp(ang, -1.45, 1.45);
      const run = speed > 1.5 && Math.abs(ang) < 0.6; // side-steps and back-steps always walk (a shuffle, not a sprint)
      const w = THREE.MathUtils.clamp((speed - 0.15) / 0.35, 0, 1);
      target = { idle: 1 - w, walk: run ? 0 : w, run: run ? w : 0 };
      rate = (run ? speed / RUN_SPEED : speed / WALK_SPEED) * (back ? -1 : 1);
      rate = Math.sign(rate) * THREE.MathUtils.clamp(Math.abs(rate), 0.35, 1.8);
    }
    this.lowerYaw += (wantYaw - this.lowerYaw) * (1 - Math.exp(-dt * 9));
    const oneShotActive = !!this.oneShot && time < this.oneShot.until;
    const fullBody = (oneShotActive && ['death', 'getUp', 'airborne', 'land', 'knockback'].includes(this.oneShot!.name)) || !opts.alive;
    for (const n of ['idle', 'walk', 'run'] as const) {
      const a = this.actions.get(n);
      if (!a) continue;
      const tw = fullBody || (opts.dizzy && opts.alive) ? 0 : target[n];
      this.loco[n] += (tw - this.loco[n]) * k;
      a.setEffectiveWeight(this.loco[n]);
      if (n !== 'idle') a.setEffectiveTimeScale(rate);
    }
    if (this.oneShot && !oneShotActive) {
      this.actions.get(this.oneShot.name)?.fadeOut(0.18);
      this.oneShot = null;
    }

    this.mixer.update(dt);
    this.body.position.set(0, opts.airborne, this.lungeNow);
    this.root.updateMatrixWorld(true);

    // Dizzy: wobbly sway over the dizzy loop (stars are drawn above the head).
    if (opts.dizzy && opts.alive) {
      const fwdW = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
      const sideW = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.quaternion);
      rotateWorld(this.bones.spine_01, fwdW, Math.sin(time * 3.2) * 0.14);
      rotateWorld(this.bones.spine_03, sideW, 0.12 + Math.sin(time * 2.1) * 0.06);
      rotateWorld(this.bones.Head, fwdW, Math.sin(time * 4.3) * 0.2);
    }
    // Hips toward the travel direction, chest counter-rotated so the fighter keeps facing the opponent.
    if (Math.abs(this.lowerYaw) > 0.01 && !fullBody) {
      rotateWorld(this.bones.pelvis, UP, this.lowerYaw);
      rotateWorld(this.bones.spine_01, UP, -this.lowerYaw * 0.35);
      rotateWorld(this.bones.spine_02, UP, -this.lowerYaw * 0.35);
      rotateWorld(this.bones.spine_03, UP, -this.lowerYaw * 0.3);
    }

    // ---- live pose layered on torso, head and arms ----
    const wantPose = this.livePose && this.joints && opts.alive && !fullBody && !opts.dizzy ? (oneShotActive ? 1 - (this.oneShot!.overrideArms ?? 1) : 1) : 0;
    this.poseWeight += (wantPose - this.poseWeight) * (1 - Math.exp(-dt * 14));
    if (this.joints && this.poseWeight > 0.01) this.applyPose(this.joints, this.poseWeight);

    // Hit reaction on top of the live pose: snap the chest and head away from the blow.
    if (this.flinch > 0.02 && opts.alive) {
      const away = this.flinchDir.clone();
      const axis = new THREE.Vector3(0, 1, 0).cross(away).normalize();
      if (axis.lengthSq() > 0.5) {
        rotateWorld(this.bones.spine_02, axis, this.flinch * 0.25);
        rotateWorld(this.bones.spine_03, axis, this.flinch * 0.2);
        rotateWorld(this.bones.Head, axis, this.flinch * 0.45);
      }
    }
    // Guard for clip-driven fighters: forearms up in front of the face.
    if (opts.blocking && !this.livePose && opts.alive && !fullBody) this.blockPose();

    // ---- strike: lunge + IK onto the target, contact measurement ----
    this.updateStrike(dt);

    // ---- body offsets: airborne height, tumble, flinch, lunge ----
    this.flinch = Math.max(0, this.flinch - dt * 3.5);
    const local = this.flinchDir.clone().applyQuaternion(this.root.quaternion.clone().invert());
    this.body.position.x = local.x * this.flinch * 0.12;
    this.body.position.z = this.lungeNow + local.z * this.flinch * 0.12;
    // Tumble pivots around the hips (1 m up), not the feet.
    const th = airborne ? Math.min(this.tumble, Math.PI * 1.6) : 0;
    this.body.rotation.x = -th;
    this.body.position.y = opts.airborne + 1.0 * (1 - Math.cos(th));
    this.body.position.z += 1.0 * Math.sin(th);

    // ---- gear ----
    this.glowBoost = Math.max(0, this.glowBoost - dt * 3);
    if (this.gloveMat) this.gloveMat.emissiveIntensity = 0.12 + this.glowBoost * 0.8 + (opts.meterFull ? 0.35 + 0.25 * Math.sin(time * 8) : 0);
    if (this.ringMat) {
      this.ringMat.opacity = opts.meterFull ? 0.75 + 0.25 * Math.sin(time * 8) : 0.35;
      this.ring.scale.setScalar(opts.meterFull ? 1.1 + 0.05 * Math.sin(time * 8) : 1);
    }
    if (this.shield) {
      // Guard bubble: shrinks and turns blue -> yellow -> red as the guard meter drops; gold for Iron Wall.
      const iron = !!opts.ironWall || opts.shield > 0;
      const guarding = !!opts.blocking && opts.alive;
      this.shield.visible = iron || guarding;
      const g = THREE.MathUtils.clamp((opts.guard ?? 100) / 100, 0, 1);
      const col = this.shieldMat.uniforms.color.value as THREE.Color;
      if (iron) col.set(0xffa800);
      else if (g > 0.5) col.copy(BLUE).lerp(YELLOW, (1 - g) * 2);
      else col.copy(YELLOW).lerp(RED, 1 - g * 2);
      const sc = iron ? 1.08 : 0.7 + 0.3 * g;
      this.shield.scale.set(sc, sc * 1.6, sc);
      this.shieldMat.uniforms.strength.value = iron ? 0.9 : 0.6;
      this.shieldMat.uniforms.time.value = time;
    }
    this.stars.visible = !!opts.dizzy && opts.alive;
    if (this.stars.visible && this.bones.Head) {
      const hp = this.bones.Head.getWorldPosition(new THREE.Vector3());
      hp.y += 0.3;
      this.stars.position.copy(this.root.worldToLocal(hp));
      this.stars.children.forEach((c, i) => {
        const a = time * 4 + (i / 5) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.22, Math.sin(a * 2) * 0.03, Math.sin(a) * 0.22);
      });
    }
    this.shadow.scale.setScalar(THREE.MathUtils.clamp(1 - opts.airborne / 3, 0.25, 1));
    this.root.visible = opts.alive || this.koTime >= 0;
  }

  private updateStrike(dt: number) {
    const s = this.strike;
    let lungeWant = 0;
    if (s) {
      const t = this.time - s.t0;
      const end = s.contactT + 0.32;
      if (t > end) this.strike = null;
      else if (s.target) {
        // IK weight: rise to 1 at contact, hold briefly, release.
        const w = t < s.contactT ? smooth(t / s.contactT) : t < s.contactT + 0.07 ? 1 : 1 - smooth((t - s.contactT - 0.07) / 0.25);
        const goal = this.aimPoint(s, new THREE.Vector3());
        if (goal) {
          const kick = s.kind === 'kick';
          const side = s.hand === 'L' ? 'l' : 'r';
          const upper = this.bones[(kick ? 'thigh_' : 'upperarm_') + side]!;
          const reach = kick ? this.len['th' + side] + this.len['ca' + side] : this.len['ua' + side] + this.len['la' + side] + 0.07;
          // Step in when the target is beyond reach (measured once the body is back at rest).
          const from = upper.getWorldPosition(new THREE.Vector3());
          const gap = from.distanceTo(goal) - reach * 0.97;
          // Never step into the target's body (roots stay at least 0.62 m apart).
          const rootDist = this.root.position.distanceTo(s.target.root.position);
          s.lunge = THREE.MathUtils.clamp(this.lungeNow + gap, 0, Math.max(0, Math.min(0.8, rootDist - 0.62)));
          lungeWant = s.lunge * w;
          this.body.position.z = lungeWant;
          this.root.updateMatrixWorld(true);
          if (s.kind === 'uppercut' || s.kind === 'super_uppercut') goal.y -= (1 - w) * 0.45; // rise from under the chin
          if (kick) {
            const pole = this.root.localToWorld(new THREE.Vector3(side === 'l' ? 0.2 : -0.2, 1.4, 1.2));
            twoBoneIK(upper, this.bones['calf_' + side]!, this.bones['foot_' + side]!, goal, pole, w, this.len['th' + side], this.len['ca' + side], 0);
          } else {
            const pole = this.root.localToWorld(new THREE.Vector3(side === 'l' ? 0.7 : -0.7, 0.6, -0.3));
            twoBoneIK(upper, this.bones['lowerarm_' + side]!, this.bones['hand_' + side]!, goal, pole, w, this.len['ua' + side], this.len['la' + side], 0.07);
          }
          if (!s.recorded && t >= s.contactT) {
            s.recorded = true;
            const hit = kick ? this.bones['foot_' + side]!.getWorldPosition(new THREE.Vector3()) : this.glovePos(s.hand);
            this.contacts.push({ kind: s.kind, d: +hit.distanceTo(goal).toFixed(3), t: +this.time.toFixed(2), lunge: +s.lunge.toFixed(2), gap: +gap.toFixed(2), w: +w.toFixed(2), live: this.livePose, rootDist: +this.root.position.distanceTo(s.target!.root.position).toFixed(2), tgtAlive: s.target!.wasAlive, tgtAir: +s.target!.body.position.y.toFixed(2) } as any);
            if (this.contacts.length > 50) this.contacts.shift();
          }
        }
      }
    }
    this.lungeNow = s && s.target ? lungeWant : this.lungeNow * Math.exp(-dt * 10);
  }

  /** Bots/remote fighters without a live pose: forearms up in front of the face. */
  private blockPose() {
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    for (const side of ['l', 'r'] as const) {
      const ua = this.bones['upperarm_' + side];
      const la = this.bones['lowerarm_' + side];
      const hd = this.bones['hand_' + side];
      if (!ua || !la || !hd) continue;
      const sx = side === 'l' ? 1 : -1;
      const elbowDir = new THREE.Vector3(sx * 0.25, -0.55, 0.8).normalize().applyQuaternion(rq);
      const foreDir = new THREE.Vector3(-sx * 0.25, 1, 0.15).normalize().applyQuaternion(rq);
      rotateBoneTowards(ua, dirOf(ua, la), elbowDir, 0.85);
      rotateBoneTowards(la, dirOf(la, hd), foreDir, 0.85);
    }
  }

  /** Rotate torso/head/arm bones toward the player's joints (swing only), blended by weight. */
  private applyPose(j: Joints, w: number) {
    const P = j.p.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const toWorld = (v: THREE.Vector3) => v.clone().applyQuaternion(rootQ);
    const chest = this.bones.spine_03;
    const ual = this.bones.upperarm_l;
    const uar = this.bones.upperarm_r;
    if (chest && ual && uar) {
      const cur = ual.getWorldPosition(new THREE.Vector3()).sub(uar.getWorldPosition(new THREE.Vector3())).normalize();
      const want = toWorld(P[J.lSh].clone().sub(P[J.rSh])).normalize();
      const mh = P[J.lHip].clone().add(P[J.rHip]).multiplyScalar(0.5);
      const ms = P[J.lSh].clone().add(P[J.rSh]).multiplyScalar(0.5);
      const wantUp = toWorld(ms.sub(mh)).normalize();
      rotateBoneTowards(chest, cur, want, w * 0.8);
      const neck = this.bones.neck_01;
      if (neck) rotateBoneTowards(chest, dirOf(chest, neck), wantUp, w * 0.5);
    }
    const head = this.bones.Head;
    if (head) {
      const me = P[J.lEar].clone().add(P[J.rEar]).multiplyScalar(0.5);
      const wantFwd = toWorld(P[J.nose].clone().sub(me).setY(0)).normalize();
      const hq = head.getWorldQuaternion(new THREE.Quaternion());
      // The head's own forward axis, learned from the first frame (when it faces the root's forward).
      if (!head.userData.fwdLocal) head.userData.fwdLocal = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ).applyQuaternion(hq.clone().invert());
      const nowFwd = (head.userData.fwdLocal as THREE.Vector3).clone().applyQuaternion(hq).setY(0).normalize();
      if (wantFwd.lengthSq() > 0.5 && nowFwd.lengthSq() > 0.5) rotateBoneTowards(head, nowFwd, wantFwd, w * 0.7);
    }
    for (const side of ['l', 'r'] as const) {
      const ua = this.bones['upperarm_' + side];
      const la = this.bones['lowerarm_' + side];
      const wr = this.bones['hand_' + side];
      if (!ua || !la || !wr) continue;
      const S = side === 'l' ? P[J.lSh] : P[J.rSh];
      const E = side === 'l' ? P[J.lEl] : P[J.rEl];
      const W = side === 'l' ? P[J.lWr] : P[J.rWr];
      rotateBoneTowards(ua, dirOf(ua, la), toWorld(E.clone().sub(S)).normalize(), w);
      rotateBoneTowards(la, dirOf(la, wr), toWorld(W.clone().sub(E)).normalize(), w);
    }
  }

  private opacity = 1;
  /** See-through when this (your own) fighter covers the opponent from the camera. */
  setOpacity(o: number, dt: number) {
    const next = this.opacity + (o - this.opacity) * Math.min(1, dt / 0.12);
    if (Math.abs(next - this.opacity) < 0.002) return;
    this.opacity = next;
    this.model?.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Outline hulls (black back faces) would show through a see-through body as a black silhouette: hide them.
      if (mesh.name.endsWith('_outline') || (mesh.material as THREE.Material).side === THREE.BackSide) {
        mesh.visible = next > 0.95;
        return;
      }
      const mat = mesh.material as THREE.Material;
      mat.transparent = next < 0.99;
      mat.opacity = next;
      mat.depthWrite = next > 0.99;
    });
  }

  /** Points used for camera occlusion tests: head, chest, hands, feet. */
  samplePoints(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const n of ['Head', 'spine_03', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'pelvis']) {
      const b = this.bones[n];
      if (b) out.push(b.getWorldPosition(new THREE.Vector3()));
    }
    return out;
  }

  /** Rough body volume (capsules) for "does this fighter block the camera's view" tests. */
  blocksRay(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    const segs: [string, string, number][] = [['pelvis', 'neck_01', 0.19], ['neck_01', 'Head', 0.12], ['upperarm_l', 'hand_l', 0.07], ['upperarm_r', 'hand_r', 0.07]];
    const ray = new THREE.Ray(origin, dir);
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    for (const [a, b, r] of segs) {
      const A = this.bones[a];
      const B = this.bones[b];
      if (!A || !B) continue;
      A.getWorldPosition(pa);
      B.getWorldPosition(pb);
      const onRay = new THREE.Vector3();
      const onSeg = new THREE.Vector3();
      const d2 = ray.distanceSqToSegment(pa, pb, onRay, onSeg);
      if (d2 < r * r && onRay.distanceTo(origin) < maxDist) return true;
    }
    return false;
  }

  glovePos(side: 'L' | 'R', out = new THREE.Vector3()) {
    const g = side === 'L' ? this.gloveL : this.gloveR;
    if (g) g.getWorldPosition(out);
    else this.root.getWorldPosition(out).setY(1.4);
    return out;
  }

  /** Where the current strike's fist/foot is now (sparks go at the contact point). */
  contactPoint(out = new THREE.Vector3()) {
    const s = this.strike;
    const foot = this.bones[s?.hand === 'L' ? 'foot_l' : 'foot_r'];
    if (s?.kind === 'kick' && foot) return foot.getWorldPosition(out); // (bones are missing until the model loads)
    return this.glovePos(s?.hand ?? 'R', out);
  }

  probe() {
    const w = (o: THREE.Object3D | null | undefined) => (o ? o.getWorldPosition(new THREE.Vector3()).toArray() : null);
    const q = (o: THREE.Object3D | null | undefined) => (o ? o.getWorldQuaternion(new THREE.Quaternion()).toArray() : null);
    return { root: w(this.root), lFoot: w(this.bones.foot_l), rFoot: w(this.bones.foot_r), chest: q(this.bones.spine_03), head: q(this.bones.Head), contacts: this.contacts.slice(-10), vis: this.root.visible, inScene: !!this.root.parent, opacity: this.opacity, bodyVis: this.body.visible, rootPos: this.root.position.toArray(), headPos: w(this.bones.Head), hairPos: w(this.hairGroup), hairScale: this.hairGroup ? this.hairGroup.getWorldScale(new THREE.Vector3()).toArray() : null };
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}

function smooth(x: number) {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function dirOf(a: THREE.Object3D, b: THREE.Object3D) {
  return b.getWorldPosition(new THREE.Vector3()).sub(a.getWorldPosition(new THREE.Vector3())).normalize();
}

/** Rotate a bone about a world axis by an angle. */
function rotateWorld(bone: THREE.Object3D | undefined, axis: THREE.Vector3, angle: number) {
  if (!bone) return;
  const parentQ = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
  const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const newWorld = _q.setFromAxisAngle(axis, angle).multiply(boneQ);
  bone.quaternion.copy(parentQ.invert().multiply(newWorld));
  bone.updateMatrixWorld(true);
}

/** Rotate a bone (in world space) so that direction `from` turns toward `to`, by fraction w. */
function rotateBoneTowards(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, w: number) {
  if (from.lengthSq() < 1e-6 || to.lengthSq() < 1e-6) return;
  const delta = _q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  if (w < 1) delta.slerp(_q2.identity(), 1 - w);
  const parentQ = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
  const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const newWorld = delta.multiply(boneQ);
  bone.quaternion.copy(parentQ.invert().multiply(newWorld));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone IK: bend upper/lower so the end (plus `tip` metres along the lower bone) reaches goal.
 * pole: world point the middle joint (elbow/knee) bends toward. Blended by w.
 */
function twoBoneIK(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, goal: THREE.Vector3, pole: THREE.Vector3, w: number, a: number, b0: number, tip: number) {
  if (w <= 0.001) return;
  const b = b0 + tip;
  const S = upper.getWorldPosition(new THREE.Vector3());
  const toG = goal.clone().sub(S);
  const dist = THREE.MathUtils.clamp(toG.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const n = toG.normalize();
  const cosA = THREE.MathUtils.clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const p = pole.clone().sub(S);
  const perp = p.sub(n.clone().multiplyScalar(p.dot(n)));
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
  perp.normalize();
  const E = S.clone().addScaledVector(n, a * cosA).addScaledVector(perp, a * Math.sqrt(1 - cosA * cosA));
  const G = S.clone().addScaledVector(n, dist);
  rotateBoneTowards(upper, dirOf(upper, lower), E.clone().sub(S), w);
  rotateBoneTowards(lower, dirOf(lower, end), G.sub(lower.getWorldPosition(new THREE.Vector3())), w);
}

function starCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#222';
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 12 : 28;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.stroke();
  g.fill();
  return c;
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
