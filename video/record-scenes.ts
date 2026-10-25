// Renders gameplay shots for the demo video with the real game in record mode (?record):
// fighters are driven by saved pose landmarks (numbers only, never the source footage), the simulation and
// renderer step on a virtual 30 fps clock, and every frame is captured. Usage:
//   npx tsx video/record-scenes.ts [shot ...]       (BASE_URL defaults to the deployed server)
import { chromium, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'video/out');
const BASE = process.env.BASE_URL ?? 'https://144-202-71-213.sslip.io';
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 720);

type Rec = {
  scene: (cfg: any) => Promise<any>;
  step: (n: number) => any;
  move: (i: number, kind: string, hand?: string) => void;
  setMeter: (i: number, v: number) => void;
  state: () => any;
};

type Cue = { op: 'meter'; player: number; value: number } | { op: 'move'; player: number; kind: string; hand: string };

interface Shot {
  name: string;
  seconds: number;
  cfg: any;
  /** Timed actions at a given second: set a player's meter, or perform a scripted move. */
  cues?: [number, Cue][];
  warmup?: number; // frames stepped before capture (skips countdown)
}

const LM = (n: string) => `/__landmarks/${n}.json`;
const P1 = '#ff3d6e';
const P2 = '#33b5ff';

const SHOTS: Shot[] = [
  {
    name: 'hook_uppercut',
    seconds: 9,
    warmup: 30 * 3.2,
    cfg: { mode: 'duel', camera: 'behind', players: [{ name: 'You', color: P1, landmarks: LM('jab_01') }], bots: 1, botLevel: 1, meter: 60 },
    cues: [[4.2, { op: 'meter', player: 0, value: 100 }], [4.6, { op: 'move', player: 0, kind: 'uppercut', hand: 'R' }]],
  },
  {
    name: 'duel_side',
    seconds: 10,
    warmup: 30 * 3.2,
    cfg: { mode: 'duel', camera: 'side', players: [{ name: 'Maya', color: P1, landmarks: LM('jab_01') }, { name: 'Leo', color: P2, landmarks: LM('hook_01') }] },
  },
  {
    name: 'online_p1',
    seconds: 8,
    warmup: 30 * 3.2,
    cfg: { mode: 'duel', camera: 'behind', follow: 0, players: [{ name: 'Maya', color: P1, landmarks: LM('jab_01') }, { name: 'Leo', color: P2, landmarks: LM('hook_01') }] },
  },
  {
    name: 'online_p2',
    seconds: 8,
    warmup: 30 * 3.2,
    cfg: { mode: 'duel', camera: 'behind', follow: 1, players: [{ name: 'Maya', color: P1, landmarks: LM('jab_01') }, { name: 'Leo', color: P2, landmarks: LM('hook_01') }] },
  },
  {
    name: 'supers',
    seconds: 10,
    warmup: 30 * 3.2,
    cfg: { mode: 'duel', camera: 'behind', players: [{ name: 'You', color: '#ffc53d', landmarks: LM('guard_02') }], bots: 1, botLevel: 2, meter: 100 },
    cues: [[0.8, { op: 'move', player: 0, kind: 'xshield', hand: 'B' }], [5.0, { op: 'meter', player: 0, value: 100 }], [5.4, { op: 'move', player: 0, kind: 'palm', hand: 'B' }]],
  },
  {
    name: 'brawl',
    seconds: 12,
    warmup: 30 * 3.5,
    cfg: { mode: 'brawl', camera: 'wide', players: [{ name: 'You', color: P1, landmarks: LM('jab_01') }], bots: 7, botLevel: 2, meter: 60 },
  },
];

async function runShot(page: Page, shot: Shot) {
  const dir = path.join(OUT, 'frames', shot.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate((cfg) => (window as any).__rec.scene(cfg), shot.cfg);
  if (shot.warmup) await page.evaluate((n) => (window as any).__rec.step(n), shot.warmup);
  const frames = Math.round(shot.seconds * 30);
  const cues = [...(shot.cues ?? [])].sort((a, b) => a[0] - b[0]);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    while (cues.length && cues[0][0] * 30 <= i) {
      const [, cue] = cues.shift()!;
      await page.evaluate((cue: Cue) => {
        const rec = (window as any).__rec;
        if (cue.op === 'meter') rec.setMeter(cue.player, cue.value);
        else rec.move(cue.player, cue.kind, cue.hand);
      }, cue);
    }
    await page.evaluate(() => (window as any).__rec.step(1));
    await page.screenshot({ path: path.join(dir, `${String(i + 1).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (i % 60 === 0) process.stdout.write(`${shot.name} ${i}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
  }
  const mp4 = path.join(OUT, `${shot.name}.mp4`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '30', '-i', path.join(dir, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4]);
  console.log('wrote', mp4);
}

const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await ctx.route((u) => u.pathname.startsWith('/__landmarks/'), (route) => {
  const f = path.join(ROOT, 'clips/landmarks', path.basename(new URL(route.request().url()).pathname));
  route.fulfill({ path: f, contentType: 'application/json' });
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${BASE}/?record&cpu&nocomment`);
await page.waitForFunction(() => (window as any).__rec, null, { timeout: 120_000 });
const secsOverride = process.env.SECS ? Number(process.env.SECS) : 0;
for (const shot of SHOTS) if (!only.length || only.includes(shot.name)) await runShot(page, secsOverride ? { ...shot, seconds: secsOverride } : shot);
await browser.close();
