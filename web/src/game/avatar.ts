// VRM fighter: loading, superhero styling, and driving bones from avatar-space joints.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { J, type Joints, type V3 } from '../../../shared/joints';

const MODEL_URL = '/avatars/seed-san.vrm';
let bufferPromise: Promise<ArrayBuffer> | null = null;

/** Download the model once (with progress), parse it per fighter. */
export function preloadModel(onProgress?: (frac: number) => void): Promise<ArrayBuffer> {
  if (!bufferPromise) {
    bufferPromise = (async () => {
      const res = await fetch(MODEL_URL);
      if (!res.ok || !res.body) throw new Error('model download failed: ' + res.status);
      const total = Number(res.headers.get('content-length') ?? 0) || 5_500_000;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        onProgress?.(Math.min(1, got / total));
      }
      const buf = new Uint8Array(got);
      let o = 0;
      for (const c of chunks) {
        buf.set(c, o);
        o += c.length;
      }
      return buf.buffer;
    })();
    bufferPromise.catch(() => (bufferPromise = null));
  }
  return bufferPromise;
}

const HIDE_MATERIALS = /backpack|glass|anim_logo|arm_mat|arm_plastic|green_emit|robo_face/;
const SUIT_MATERIALS = /huku|wear_metal|armgear/;

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

function v3(a: V3) {
  return new THREE.Vector3(a[0], a[1], a[2]);
}

/** Quaternion whose local X and Y axes map to the given (roughly orthogonal) world vectors. */
function basisQuat(x: THREE.Vector3, yHint: THREE.Vector3, out = new THREE.Quaternion()) {
  const X = x.clone().normalize();
  const Z = new THREE.Vector3().crossVectors(X, yHint).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
  _m.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(_m);
}

export interface FighterStyle {
  color: string; // suit tint
  aura?: string; // aura/glove glow color
}

export class FighterAvatar {
  /** Cheaper materials for CPU-rendered test runs and weak phones. */
  static lowGfx = false;
  root = new THREE.Group(); // positioned and rotated by the game (yaw)
  body = new THREE.Group(); // local offsets (flinch, launch)
  vrm!: VRM;
  ready: Promise<void>;
  private gloves: THREE.Mesh[] = [];
  private gloveMat!: THREE.MeshStandardMaterial;
  private aura!: THREE.Mesh;
  private auraMat!: THREE.ShaderMaterial;
  private shield!: THREE.Mesh;
  private targetRing!: THREE.Mesh;
  private blockSpark = 0;
  private flinch = 0;
  private flinchDir = new THREE.Vector3();
  private elbowNormals = { L: new THREE.Vector3(0, -1, 0), R: new THREE.Vector3(0, 1, 0) };
  style: FighterStyle;
  glowBoost = 0;

  constructor(style: FighterStyle) {
    this.style = style;
    this.root.add(this.body);
    this.ready = this.load();
  }

  private async load() {
    const buf = await preloadModel();
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    const gltf = await loader.parseAsync(buf.slice(0), '');
    const vrm = gltf.userData.vrm as VRM;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    this.vrm = vrm;
    vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      if (mesh.name.startsWith('robo_arm')) mesh.visible = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as any[]) {
        if (HIDE_MATERIALS.test(m.name)) mesh.visible = false;
        if (FighterAvatar.lowGfx && m.isMToonMaterial) m.outlineWidthMode = 'none';
      }
    });
    this.body.add(vrm.scene);
    this.applyStyle(this.style);
    this.addGear();
  }

  applyStyle(style: FighterStyle) {
    this.style = style;
    if (!this.vrm) return;
    const suit = new THREE.Color(style.color);
    const glow = new THREE.Color(style.aura ?? style.color);
    this.vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as any[]) {
        if (SUIT_MATERIALS.test(m.name)) {
          if (!m.userData.baseColor) m.userData.baseColor = m.color?.clone();
          if (m.color) m.color.copy(suit).lerp(new THREE.Color(1, 1, 1), 0.15);
          if (m.shadeColorFactor) m.shadeColorFactor.copy(suit).multiplyScalar(0.45);
        }
        if (m.parametricRimColorFactor) {
          m.parametricRimColorFactor.copy(glow);
          m.parametricRimFresnelPowerFactor = 3;
          m.parametricRimLiftFactor = 0.1;
        }
      }
    });
    if (this.gloveMat) {
      this.gloveMat.color.copy(glow).multiplyScalar(0.6);
      this.gloveMat.emissive.copy(glow);
    }
    if (this.auraMat) this.auraMat.uniforms.color.value.copy(glow);
  }

  private addGear() {
    const glow = new THREE.Color(this.style.aura ?? this.style.color);
    this.gloveMat = new THREE.MeshStandardMaterial({ color: glow.clone().multiplyScalar(0.6), emissive: glow, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.2 });
    for (const bone of ['leftHand', 'rightHand'] as VRMHumanBoneName[]) {
      const node = this.vrm.humanoid.getRawBoneNode(bone);
      if (!node) continue;
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), this.gloveMat);
      g.scale.set(1.15, 0.9, 1);
      g.position.set(bone === 'leftHand' ? 0.05 : -0.05, 0, 0);
      node.add(g);
      this.gloves.push(g);
    }
    // Aura: additive fresnel shell around the body.
    this.auraMat = new THREE.ShaderMaterial({
      uniforms: { color: { value: glow }, time: { value: 0 }, power: { value: 0.35 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vY = position.y; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec3 color; uniform float time; uniform float power; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float flick = 0.75 + 0.25*sin(time*9.0 + vY*14.0);
          gl_FragColor = vec4(color * f * flick * power * 2.2, f * power); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.aura = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.0, 8, 24), this.auraMat);
    this.aura.position.y = 0.9;
    this.body.add(this.aura);
    // Shield bubble (Shield super)
    this.shield = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.95, 3),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }),
    );
    this.shield.position.y = 1.0;
    this.shield.visible = false;
    this.body.add(this.shield);
    // Target lock ring (Brawl)
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40), new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.position.y = 0.02;
    this.targetRing.visible = false;
    this.root.add(this.targetRing);
  }

  setTargeted(on: boolean) {
    if (this.targetRing) this.targetRing.visible = on;
  }

  /** Apply avatar-space joints to the normalized humanoid bones. */
  setJoints(j: Joints) {
    if (!this.vrm) return;
    const p = j.p.map(v3);
    const hum = this.vrm.humanoid;
    const set = (name: VRMHumanBoneName, q: THREE.Quaternion) => {
      const n = hum.getNormalizedBoneNode(name);
      if (n) n.quaternion.copy(q);
    };
    const lS = p[J.lSh];
    const rS = p[J.rSh];
    const MS = lS.clone().add(rS).multiplyScalar(0.5);
    const lH = p[J.lHip];
    const rH = p[J.rHip];
    const MH = lH.clone().add(rH).multiplyScalar(0.5);
    const up = MS.clone().sub(MH);
    if (up.lengthSq() < 1e-4) up.set(0, 1, 0);

    // Hips: yaw from the hip line, kept upright.
    const hipX = lH.clone().sub(rH);
    hipX.y = 0;
    if (hipX.lengthSq() < 1e-4) hipX.set(1, 0, 0);
    const Qh = basisQuat(hipX, new THREE.Vector3(0, 1, 0));
    // Chest: shoulder line and torso up.
    const Qc = basisQuat(lS.clone().sub(rS), up);
    const Qs = Qh.clone().slerp(Qc, 0.5);
    set('hips', Qh);
    set('spine', Qh.clone().invert().multiply(Qs));
    set('chest', Qs.clone().invert().multiply(Qc));
    set('upperChest', new THREE.Quaternion());

    // Head from ears and nose.
    const lE = p[J.lEar];
    const rE = p[J.rEar];
    const ME = lE.clone().add(rE).multiplyScalar(0.5);
    const fwd = p[J.nose].clone().sub(ME);
    const headX = lE.clone().sub(rE);
    // Head up = forward x left. The nose sits slightly below the ears, so blend toward the torso up.
    const headY = new THREE.Vector3().crossVectors(fwd, headX);
    if (headY.lengthSq() > 1e-6 && headX.lengthSq() > 1e-6) {
      const Qhead = basisQuat(headX, headY.normalize().lerp(up.clone().normalize(), 0.3));
      const Qn = Qc.clone().slerp(Qhead, 0.5);
      set('neck', Qc.clone().invert().multiply(Qn));
      set('head', Qn.clone().invert().multiply(Qhead));
    }

    // Arms
    for (const side of ['L', 'R'] as const) {
      const S = side === 'L' ? lS : rS;
      const E = side === 'L' ? p[J.lEl] : p[J.rEl];
      const W = side === 'L' ? p[J.lWr] : p[J.rWr];
      const dU = E.clone().sub(S).normalize();
      const dL = W.clone().sub(E).normalize();
      const n = new THREE.Vector3().crossVectors(dU, dL);
      const bend = n.length();
      // Straight arm: keep the last good bend axis to avoid twisting pops.
      if (bend > 0.15) this.elbowNormals[side].copy(n.normalize());
      const nn = this.elbowNormals[side];
      // Left: local X = limb, local Y = -n. Right: local X = -limb, local Y = n.
      const Qu = side === 'L' ? basisQuat(dU, nn.clone().negate()) : basisQuat(dU.clone().negate(), nn);
      const Ql = side === 'L' ? basisQuat(dL, nn.clone().negate()) : basisQuat(dL.clone().negate(), nn);
      const pre = side === 'L' ? 'left' : 'right';
      set(`${pre}Shoulder` as VRMHumanBoneName, new THREE.Quaternion());
      set(`${pre}UpperArm` as VRMHumanBoneName, Qc.clone().invert().multiply(Qu));
      set(`${pre}LowerArm` as VRMHumanBoneName, Qu.clone().invert().multiply(Ql));
      set(`${pre}Hand` as VRMHumanBoneName, new THREE.Quaternion());
    }

    // Legs: from joints when visible, else a relaxed fighting stance.
    for (const side of ['L', 'R'] as const) {
      const H = side === 'L' ? lH : rH;
      let K = side === 'L' ? p[J.lKnee] : p[J.rKnee];
      let A = side === 'L' ? p[J.lAnk] : p[J.rAnk];
      if (!j.legs) {
        const sx = side === 'L' ? 1 : -1;
        K = new THREE.Vector3(H.x + sx * 0.04, H.y - 0.42, H.z + (side === 'L' ? 0.06 : -0.02));
        A = new THREE.Vector3(H.x + sx * 0.06, H.y - 0.84, H.z + (side === 'L' ? 0.02 : -0.08));
      }
      const dT = K.clone().sub(H).normalize();
      const dS = A.clone().sub(K).normalize();
      let n = new THREE.Vector3().crossVectors(dT, dS);
      if (n.length() < 0.1) n = hipX.clone().normalize();
      else n.normalize();
      // Rest bone axis is -Y; knee axis is local X.
      const Qt = basisQuat(n, dT.clone().negate());
      const Qk = basisQuat(n, dS.clone().negate());
      // basisQuat takes (X, yHint): here X = knee axis, Y = -limb direction.
      const pre = side === 'L' ? 'left' : 'right';
      set(`${pre}UpperLeg` as VRMHumanBoneName, Qh.clone().invert().multiply(Qt));
      set(`${pre}LowerLeg` as VRMHumanBoneName, Qt.clone().invert().multiply(Qk));
    }
  }

  flinchFrom(dirWorld: THREE.Vector3, amount: number) {
    this.flinch = Math.min(1, this.flinch + amount);
    this.flinchDir.copy(dirWorld).setY(0).normalize();
  }

  sparkBlock() {
    this.blockSpark = 1;
  }

  update(dt: number, time: number, opts: { shield: number; meterFull: boolean; airborne: number; alive: boolean }) {
    if (!this.vrm) return;
    this.vrm.update(dt);
    this.flinch = Math.max(0, this.flinch - dt * 4);
    // Flinch: shove the body away from the hit, in the root's local frame.
    const local = this.flinchDir.clone().applyQuaternion(this.root.quaternion.clone().invert());
    this.body.position.set(local.x * this.flinch * 0.18, opts.airborne, local.z * this.flinch * 0.18);
    this.body.rotation.x = -this.flinch * 0.25 * Math.sign(local.z || 1);
    this.glowBoost = Math.max(0, this.glowBoost - dt * 3);
    if (this.auraMat) {
      this.auraMat.uniforms.time.value = time;
      this.auraMat.uniforms.power.value = (opts.meterFull ? 0.9 + 0.3 * Math.sin(time * 8) : 0.08) + this.glowBoost;
      this.aura.visible = this.auraMat.uniforms.power.value > 0.1;
    }
    if (this.gloveMat) this.gloveMat.emissiveIntensity = 0.6 + this.glowBoost * 3 + (opts.meterFull ? 0.6 : 0);
    if (this.shield) {
      this.shield.visible = opts.shield > 0;
      this.shield.rotation.y += dt * 1.5;
      (this.shield.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.15 * Math.sin(time * 12);
    }
    this.root.visible = opts.alive;
    void _v;
  }

  /** World position of a glove (for VFX). */
  glovePos(side: 'L' | 'R', out = new THREE.Vector3()) {
    const g = this.gloves[side === 'L' ? 0 : 1];
    if (g) g.getWorldPosition(out);
    else this.root.getWorldPosition(out).setY(1.3);
    return out;
  }

  dispose() {
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    this.root.removeFromParent();
  }
}
