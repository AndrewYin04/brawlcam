// Spec 11.1 evidence: renders scripted scenes with the real game (record mode), saves 10 fps frame strips, a contact
// sheet and a short MP4 per scene, and measures foot sliding, drift, and frozen torso/head.
// Usage: ROUND=r0 Q='' npx tsx video/review-capture.ts [scene ...]
import { chromium, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROUND = process.env.ROUND ?? 'r0';
const OUT = path.join(ROOT, 'video/out/review', ROUND);
const BASE = process.env.BASE_URL ?? 'https://throwhands.tech';
const Q = process.env.Q ?? '';
fs.mkdirSync(OUT, { recursive: true });
const LM = (n: string) => `/__landmarks/${n}.json`;

type Cue = [number, string, ...unknown[]]; // [second, method, ...args] on window.__rec
interface Scene { name: string; seconds: number; cfg: any; cues?: Cue[]; warmup?: number }
const duel = (players: any[], extra: any = {}) => ({ mode: 'duel', camera: 'behind', players, bots: 1, botLevel: -1, meter: 40, ...extra });
const P = (lm: string, offset = 0) => ({ name: 'You', color: '#ff3d6e', landmarks: LM(lm), offset });

const SCENES: Scene[] = [
  { name: 'idle', seconds: 3, cfg: duel([P('guard_02')]) },
  { name: 'walk', seconds: 3, cfg: duel([P('guard_02')]), cues: [[0, 'setMove', 0, [0.5, 0]]] },
  { name: 'run', seconds: 3, cfg: duel([P('guard_02')]), cues: [[0, 'setMove', 0, [1, 0]]] },
  { name: 'walk_forward_back', seconds: 3, cfg: duel([P('guard_02')]), cues: [[0, 'setMove', 0, [0, -0.8]], [1.5, 'setMove', 0, [0, 0.8]]] },
  { name: 'jab', seconds: 3, cfg: duel([P('jab_01', 0.3)]) },
  { name: 'hook', seconds: 3, cfg: duel([P('hook_01', 1.4)]) },
  { name: 'uppercut', seconds: 3, cfg: duel([P('guard_02')], { meter: 100 }), cues: [[0.5, 'move', 0, 'uppercut', 'R']] },
  { name: 'block', seconds: 3, cfg: duel([P('block_01', 3.0)]) },
  // Iron Wall: a real clip of a person crossing their forearms above the face (X at about 1.2 s into the clip).
  { name: 'shield', seconds: 3, cfg: duel([P('xshield_01', 0.9)], { meter: 100, botLevel: 3 }), cues: [[0.3, 'move', 0, 'xshield', 'B']] },
  { name: 'energy_blast', seconds: 3, cfg: duel([P('guard_02')], { meter: 100 }), cues: [[0.5, 'move', 0, 'palm', 'B']] },
  { name: 'getting_hit', seconds: 3, cfg: duel([P('guard_02')], { botLevel: 3 }) },
  { name: 'knockback', seconds: 3, cfg: duel([P('guard_02')]), cues: [[0.4, 'moveId', 2, 'uppercut', 'R', true]] },
  { name: 'ko', seconds: 4, cfg: duel([P('jab_01', 0.3)]), cues: [[0, 'setHp', 2, 12], [0.6, 'move', 0, 'jab', 'L']] },
  // Cage slam: a super uppercut next to the fence; the opponent hits the cage and bounces off.
  { name: 'cage_slam', seconds: 4, cfg: duel([P('guard_02')], { meter: 100 }), cues: [[0, 'place', 2, 0, -2.7, 90], [0, 'place', 1, 0, -1.7], [0.6, 'move', 0, 'uppercut', 'R']] },
  // Guard break: the player holds the guard with little meter left while the bot attacks; then dizzy and a clean hit.
  { name: 'guard_break', seconds: 4, cfg: duel([P('block_01', 3.0)], { botLevel: 3 }), cues: [[0, 'setGuard', 1, 25]] },
  // Circling: strafe left then right (step-sideways input).
  { name: 'strafe', seconds: 3, cfg: duel([P('guard_02')]), cues: [[0, 'setMove', 0, [0.8, 0]], [1.5, 'setMove', 0, [-0.8, 0]]] },
  // Camera near the cage (2:35/2:45 AM): your back to the fence, the opponent against the far fence, in a corner.
  { name: 'cage_near', seconds: 3, cfg: duel([P('jab_01', 0.3)], { botLevel: 2 }), cues: [[0, 'place', 1, 0, -3.0], [0, 'place', 2, 0, -1.8]] },
  { name: 'cage_far', seconds: 3, cfg: duel([P('jab_01', 0.3)], { botLevel: 2 }), cues: [[0, 'place', 1, 0, 1.9], [0, 'place', 2, 0, 3.1]] },
  { name: 'cage_corner', seconds: 3, cfg: duel([P('hook_01', 1.4)], { botLevel: 2 }), cues: [[0, 'place', 1, -2.2, -2.2], [0, 'place', 2, -1.4, -1.4]] },
  // Big punches while standing still: the fighter must not move (bug fixed 3:10 AM; metric: displacement).
  { name: 'big_punches', seconds: 4, cfg: duel([P('uppercut_01', 0.0)], { botLevel: -1 }) },
  { name: 'brawl8', seconds: 4, cfg: { mode: 'brawl', camera: 'wide', players: [P('jab_01')], bots: 7, botLevel: 2, meter: 50 }, warmup: 30 * 3.6 },
];

async function runScene(page: Page, sc: Scene) {
  const dir = path.join(OUT, sc.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate((cfg) => (window as any).__rec.scene(cfg), sc.cfg);
  // Placements at t=0 happen before the warm-up, so the capture never starts with fighters gliding into place.
  for (const [t, method, ...args] of sc.cues ?? []) if (t === 0 && method === 'place') await page.evaluate(({ method, args }) => (window as any).__rec[method](...args), { method, args });
  await page.evaluate((n) => (window as any).__rec.step(n), sc.warmup ?? 30 * 3.3);
  await page.evaluate(() => (window as any).__rec.resetCamStats?.());
  const frames = Math.round(sc.seconds * 30);
  const cues = [...(sc.cues ?? [])].filter((c) => !(c[0] === 0 && c[1] === 'place')).sort((a, b) => a[0] - b[0]);
  const probes: any[] = [];
  for (let i = 0; i < frames; i++) {
    while (cues.length && cues[0][0] * 30 <= i) {
      const [, method, ...args] = cues.shift()!;
      await page.evaluate(({ method, args }) => (window as any).__rec[method](...args), { method, args });
    }
    await page.evaluate(() => (window as any).__rec.step(1));
    if (i === 8) await page.evaluate(() => (window as any).__rec.resetCamStats?.()); // ignore the scene-start placement
    probes.push(await page.evaluate(() => (window as any).__rec.probe()));
    await page.screenshot({ path: path.join(dir, `${String(i + 1).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 85 });
  }
  // 10 fps strip (every 3rd frame) as a contact sheet; full-rate MP4 clip.
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '30', '-i', path.join(dir, '%04d.jpg'), '-vf', 'select=not(mod(n\\,3)),scale=320:-1,tile=6x5', '-frames:v', '1', path.join(OUT, `${sc.name}_sheet.jpg`)]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '30', '-i', path.join(dir, '%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', path.join(OUT, `${sc.name}.mp4`)]);
  // Measurements for the player's fighter (first probe entry).
  const me = probes.map((p) => p[0]).filter(Boolean);
  let slideSum = 0, slideN = 0, slideMax = 0, drift = 0, frozen = 0, moving = 0;
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const qd = (a: number[] | null, b: number[] | null) => (a && b ? 1 - Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) : 0);
  for (let i = 1; i < me.length; i++) {
    const a = me[i - 1], b = me[i];
    if (!a.root || !b.root) continue;
    const rootSpeed = (dist(a.root, b.root) * 30);
    // The planted foot is the lower of the two (and close to the ground); the swinging foot is allowed to move.
    if (a.lFoot && b.lFoot && a.rFoot && b.rFoot) {
      const k = b.lFoot[1] <= b.rFoot[1] ? 'lFoot' : 'rFoot';
      const lowA = a.lFoot[1] <= a.rFoot[1] ? 'lFoot' : 'rFoot';
      if (k === lowA && b[k][1] - b.root[1] < 0.15) {
        const d = dist(a[k], b[k]);
        slideSum += d; slideN++; slideMax = Math.max(slideMax, d);
      }
    }
    // Drift: the body moves but neither foot is lifted or swinging relative to the body.
    if (rootSpeed > 0.2) {
      moving++;
      const footRel = ['lFoot', 'rFoot'].map((k) => (a[k] && b[k] ? Math.abs(dist(a[k], b[k]) - dist(a.root, b.root)) : 0));
      if (Math.max(...footRel) < 0.004) drift++;
    }
    if (qd(a.chest, b.chest) < 1e-7 && qd(a.head, b.head) < 1e-7) frozen++;
  }
  // Contact (spec 11 "strikes visibly connect"): fist/foot-to-target distance on each contact frame, all fighters.
  const seen = new Set<string>();
  const contacts: { kind: string; d: number }[] = [];
  for (const p of probes) for (const [fi, f] of (p as any[]).entries()) for (const c of f?.contacts ?? []) {
    const key = `${fi}:${c.t}:${c.kind}`;
    if (!seen.has(key)) { seen.add(key); contacts.push(c); }
  }
  if (process.env.DEBUG_CONTACT) console.log(JSON.stringify(contacts));
  const cd = contacts.map((c) => c.d * 100);
  const contact = cd.length ? { contactHits: cd.length, contactMeanCm: +(cd.reduce((a, b) => a + b, 0) / cd.length).toFixed(1), contactMaxCm: +Math.max(...cd).toFixed(1) } : { contactHits: 0 };
  const cam = await page.evaluate(() => (window as any).__rec.camStats?.());
  const m = { scene: sc.name, ...contact, ...(cam ?? {}), frames: me.length, footSlideMeanCm: +((slideSum / Math.max(1, slideN)) * 100).toFixed(2), footSlideMaxCm: +(slideMax * 100).toFixed(2), movingFrames: moving, driftFrames: drift, frozenTorsoHeadFrames: frozen };
  fs.writeFileSync(path.join(OUT, `${sc.name}_metrics.json`), JSON.stringify(m));
  console.log(JSON.stringify(m));
}

const only = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.pathname.startsWith('/__landmarks/'), (route) => route.fulfill({ path: path.join(ROOT, 'clips/landmarks', path.basename(new URL(route.request().url()).pathname)), contentType: 'application/json' }));
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${BASE}/?record&nocomment${Q}`);
await page.waitForFunction(() => (window as any).__rec, null, { timeout: 120_000 });
for (const sc of SCENES) if (!only.length || only.includes(sc.name)) await runScene(page, sc);
await browser.close();
