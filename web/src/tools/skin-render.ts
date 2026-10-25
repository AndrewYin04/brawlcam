// Dev-only skin preview renderer: the game's own HeroFighter (same model, toon materials, outline hull, gloves
// and aura ring) recolored through applyStyle(), the same path a match uses for the equipped skin.
// scripts/render-skins.ts drives window.renderSkin() from Playwright and writes the images to web/public/skins.
import * as THREE from 'three';
import { HeroFighter } from '../game/hero';

const gl = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // as in the arena
renderer.toneMappingExposure = 1.1;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
// The arena's light rig (stage.ts buildLights), plus a soft front fill so the face reads in a portrait.
scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x1a1420, 0.7));
const key = new THREE.SpotLight(0xfff2e0, 40, 30, 0.62, 0.5, 1.2);
key.position.set(0, 13, 0);
scene.add(key, key.target);
const k2 = new THREE.DirectionalLight(0xfff1dc, 1.0);
k2.position.set(5, 10, 6);
const rim = new THREE.DirectionalLight(0x88b8ff, 1.3);
rim.position.set(-6, 6, -9);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(-2, 2, 6);
scene.add(k2, rim, fill);

const camera = new THREE.PerspectiveCamera(27, 0.8, 0.1, 50);
camera.position.set(0, 1.05, 4.9);
camera.lookAt(0, 0.84, 0);

const fighter = new HeroFighter({ color: '#ff3d6e' }, 'male_light'); // the local player's fighter (slot 1)
scene.add(fighter.root);
const idle = { shield: 0, meterFull: false, airborne: 0, alive: true };
const ready = fighter.ready.then(() => {
  // Settle into the guard idle, then freeze (dt 0) so every frame of a turntable is the same pose.
  for (let i = 0; i < 20; i++) fighter.update(1 / 30, i / 30, idle);
});

function backdrop(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  ctx.fillStyle = '#0a0c15';
  ctx.fillRect(0, 0, w, h);
  const c = new THREE.Color(color);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  // Aura: a glow in the skin's color behind the fighter, and a pool of it on the floor.
  let g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, h * 0.55);
  g.addColorStop(0, `rgba(${rgb},0.55)`);
  g.addColorStop(0.45, `rgba(${rgb},0.18)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h * 0.9);
  ctx.scale(1, 0.22);
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.45);
  g.addColorStop(0, `rgba(${rgb},0.45)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Render the fighter in `color` turned by `yaw` (radians; 0 faces the camera) as a w x h image data URL. */
async function renderSkin(color: string, yaw: number, w: number, h: number, type = 'image/png', quality = 0.9) {
  await ready;
  fighter.applyStyle({ color });
  fighter.update(0, 1, idle);
  const ring = (fighter as any).ringMat as THREE.MeshBasicMaterial | undefined;
  if (ring) ring.opacity = 0.8; // aura ring at full strength for the showcase
  fighter.root.rotation.y = yaw;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  backdrop(ctx, w, h, color);
  ctx.drawImage(gl, 0, 0);
  return out.toDataURL(type, quality);
}

(window as any).renderSkin = renderSkin;
(window as any).skinRenderReady = ready.then(() => true);
