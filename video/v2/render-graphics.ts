// demo-video-v2 motion graphics renderer.
// Each asset is a scene in video/v2/graphics/scenes.js, a pure function of time. Playwright seeks the scene to
// t = frame / 30 for every frame (no wall clock), screenshots the 1920x1080 page, and pipes the PNGs into ffmpeg:
//   opaque  -> H.264 yuv420p .mp4
//   overlay -> ProRes 4444 with alpha .mov (transparent page background), ready for ffmpeg `overlay`.
// Card animations land on the music's beat: the beat length comes from video/v2/music/beats.json.
//
// Usage:
//   npx tsx video/v2/render-graphics.ts                      # every asset
//   npx tsx video/v2/render-graphics.ts card_body pipeline   # only these ids
//   npx tsx video/v2/render-graphics.ts --jobs 3             # parallel pages (default 3)
//   npx tsx video/v2/render-graphics.ts --callout "LEFT JAB|9 DMG" --name callout_left_jab [--target 1010,430] [--color p2]
//   npx tsx video/v2/render-graphics.ts --pip 1288,150,480,360 --name pip_custom
// Outputs: video/v2/out/<id>.(mp4|mov), video/v2/out/frames/<id>/*.png (review frames), video/v2/out/manifest.json
import { chromium, type Page } from '@playwright/test';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const V2 = path.resolve(import.meta.dirname);
const OUT = path.join(V2, 'out');
const FRAMES = path.join(OUT, 'frames');
const FPS = 30, W = 1920, H = 1080;
fs.mkdirSync(FRAMES, { recursive: true });

const beatsFile = path.join(V2, 'music/beats.json');
const beats = fs.existsSync(beatsFile) ? JSON.parse(fs.readFileSync(beatsFile, 'utf8')) : null;
const BPM: number = beats?.bpm ?? 130;
const BEAT = 60 / BPM;

/** Numbers on the stat tiles. Sources (see the commit / report): TESTING.md line 14, line 71, line 82, line 121; STATUS.md line 226. */
const STATS = [
  { value: 48, label: 'END-TO-END TESTS PASS', sub: 'real browsers in Playwright, recorded fighter clips as the webcam', c: 'p1' },
  { value: '0', countSub: 2160, label: 'STATE MISMATCHES', sub: 'between both screens over <b style="color:#fff">{n}</b> shared ticks online', c: 'good' },
  { value: 3.4, dec: 1, suffix: '×', label: 'POSE-STREAM COMPRESSION', sub: '19.7 MB down to 5.9 MB per player-hour in Tiger Data', c: 'p2' },
  { value: 8, label: 'BROWSERS IN ONE BRAWL', sub: 'same state on all 8: 0 mismatches over 2,494 ticks', c: 'gold' },
];

type Asset = { id: string; scene: string; params?: Record<string, unknown>; desc: string };
const callout = (id: string, move: string, effect: string, extra: Record<string, unknown> = {}, desc = ''): Asset => ({ id, scene: 'callout', params: { move, effect, ...extra }, desc: desc || `Lower third: ${move} -> ${effect}` });

const ASSETS: Asset[] = [
  { id: 'logo_open', scene: 'logo_open', desc: 'Logo sting: THROW / HANDS slam in from both sides, impact flash, shockwave, HACKTX 2026' },
  { id: 'end_card', scene: 'end_card', desc: 'End card: logo, throwhands.tech reveal, "Play free in your browser. Just a webcam.", Built at HackTX 2026' },
  { id: 'card_body', scene: 'card_body', desc: 'Kinetic type: YOUR / BODY / IS THE / CONTROLLER (one word per beat)' },
  { id: 'card_friends', scene: 'card_friends', desc: 'Kinetic type: FIGHT / YOUR FRIENDS / FROM / ANYWHERE with pink and blue split screens' },
  { id: 'card_nocontroller', scene: 'card_nocontroller', desc: 'Kinetic type: NO CONTROLLER. NO DOWNLOAD. (struck through) JUST A WEBCAM.' },
  { id: 'title_demo', scene: 'title_demo', desc: 'Section title: 02 THE DEMO' },
  { id: 'title_ai', scene: 'title_ai', desc: 'Section title: 03 HOW THE AI WORKS' },
  { id: 'title_built', scene: 'title_built', desc: 'Section title: 04 HOW WE BUILT IT' },
  { id: 'pipeline', scene: 'pipeline', desc: 'AI pipeline: Webcam -> MediaPipe Pose -> gesture rules -> game sim -> opponent screen; Meta Muse, Gemini, ElevenLabs branches; particles' },
  { id: 'stats', scene: 'stats', params: { stats: STATS }, desc: 'Stat counters: 48 e2e tests, 0 mismatches over 2,160 ticks, 3.4x compression, 8 browsers' },
  callout('callout_right_hook', 'RIGHT HOOK', '11 DMG'),
  callout('callout_guard_broken', 'GUARD BROKEN', '2 s DIZZY', { color: 'p2' }),
  callout('callout_iron_wall', 'IRON WALL', 'COUNTERS THE NEXT HIT', { color: 'p2' }),
  callout('callout_super_uppercut', 'SUPER UPPERCUT', 'INTO THE CAGE'),
  callout('callout_right_hook_pointer', 'RIGHT HOOK', '11 DMG', { target: [1180, 470] }, 'Lower third with the optional pointer to a body part (sample target 1180,470)'),
  { id: 'pip_real_punch', scene: 'pip', params: { rect: { x: 1288, y: 150, w: 480, h: 360 } }, desc: 'REAL PUNCH PiP label: corner brackets around a 480x360 PiP at (1288,150), tag, chevrons toward the fighter. Holds after 0.6 s (extend with tpad)' },
  { id: 'transition_whip', scene: 'whip', desc: 'Whip transition, 9 frames: bands sweep right to left, full cover on frame 4 (cut there)' },
  { id: 'transition_glitch', scene: 'glitch', desc: 'Glitch transition, 9 frames: RGB slices, full cover on frame 4 (cut there)' },
  { id: 'flash_3f', scene: 'flash', params: { levels: [1, 0.55, 0.2] }, desc: 'White flash, 3 frames (100%, 55%, 20%)' },
  { id: 'flash_2f', scene: 'flash', params: { levels: [1, 0.4] }, desc: 'White flash, 2 frames (100%, 40%)' },
];

// ---------- CLI
const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const jobs = Number(opt('--jobs') ?? 3);
const cOpt = opt('--callout'), pOpt = opt('--pip'), nameOpt = opt('--name'), targetOpt = opt('--target'), colorOpt = opt('--color'), labelOpt = opt('--label');
let todo: Asset[];
if (cOpt) {
  const [move, effect] = cOpt.split('|');
  todo = [callout(nameOpt ?? 'callout_custom', move.trim(), (effect ?? '').trim(), { ...(targetOpt ? { target: targetOpt.split(',').map(Number) } : {}), ...(colorOpt ? { color: colorOpt } : {}) })];
} else if (pOpt) {
  const [x, y, w, h] = pOpt.split(',').map(Number);
  todo = [{ id: nameOpt ?? 'pip_custom', scene: 'pip', params: { rect: { x, y, w, h }, ...(labelOpt ? { label: labelOpt } : {}) }, desc: `PiP label at ${pOpt}` }];
} else {
  todo = args.length ? ASSETS.filter((a) => args.includes(a.id)) : ASSETS;
  const unknown = args.filter((a) => !ASSETS.some((x) => x.id === a));
  if (unknown.length) throw new Error(`unknown asset ids: ${unknown.join(', ')}`);
}

const pageUrl = pathToFileURL(path.join(V2, 'graphics/index.html')).href;

type Result = { id: string; file: string; dur: number; frames: number; alpha: boolean; hits: number[]; cutFrame: number | null; desc: string; params?: Record<string, unknown> };

async function render(page: Page, a: Asset): Promise<Result> {
  await page.goto(pageUrl);
  await page.evaluate(() => Promise.all(['64px Bungee', '500 64px Inter', '600 64px Inter', '800 64px Inter'].map((f) => document.fonts.load(f))).then(() => null));
  const fontsOk = await page.evaluate(() => document.fonts.check('64px Bungee') && document.fonts.check('800 64px Inter'));
  if (!fontsOk) throw new Error('brand fonts failed to load');
  const info = await page.evaluate(([scene, params]) => (window as any).__build(scene, params), [a.scene, { beat: BEAT, ...(a.params ?? {}) }] as const);
  const frames = Math.round(info.dur * FPS);
  const file = path.join(OUT, `${a.id}.${info.alpha ? 'mov' : 'mp4'}`);
  const enc = info.alpha
    ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0']
    : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '14', '-tune', 'animation', '-movflags', '+faststart'];
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...enc, '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise<void>((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c} for ${a.id}`)))));
  // review frames: a spread across the clip plus the last frame
  const fdir = path.join(FRAMES, a.id);
  fs.rmSync(fdir, { recursive: true, force: true });
  fs.mkdirSync(fdir, { recursive: true });
  const keep = new Set([0.1, 0.25, 0.45, 0.65, 0.85].map((f) => Math.min(frames - 1, Math.round(f * frames))).concat([frames - 1]));
  if (frames <= 10) for (let i = 0; i < frames; i++) keep.add(i);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => (window as any).__seek(t), i / FPS);
    const png = await page.screenshot({ type: 'png', omitBackground: info.alpha, clip: { x: 0, y: 0, width: W, height: H } });
    if (keep.has(i)) fs.writeFileSync(path.join(fdir, `f${String(i).padStart(3, '0')}.png`), png);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  // contact sheet of the review frames (alpha clips over a grey checkerboard so transparency is visible)
  fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true });
  const n = fs.readdirSync(fdir).length, cols = 3, rows = Math.ceil(n / cols);
  const bgf = info.alpha ? `color=c=0x4a4f5c:s=${W}x${H},format=rgba,geq=r='if(mod(floor(X/120)+floor(Y/120),2),90,60)':g='if(mod(floor(X/120)+floor(Y/120),2),95,64)':b='if(mod(floor(X/120)+floor(Y/120),2),110,74)':a=255[bg];[bg][0]overlay=0:0,` : '';
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-pattern_type', 'glob', '-i', path.join(fdir, '*.png'), '-filter_complex', `${bgf}scale=640:360,tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', path.join(OUT, 'sheets', `${a.id}.png`)]);
  const probed = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
  console.log(`${a.id.padEnd(28)} ${frames} frames  ${probed.toFixed(3)} s  ${info.alpha ? 'alpha .mov' : 'opaque .mp4'}`);
  return { id: a.id, file, dur: +(frames / FPS).toFixed(3), frames, alpha: info.alpha, hits: info.hits, cutFrame: info.cutFrame, desc: a.desc, params: a.params?.stats ? undefined : a.params };
}

const t0 = Date.now();
const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const queue = [...todo];
const results: Result[] = [];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  for (let a = queue.shift(); a; a = queue.shift()) results.push(await render(page, a));
  await page.close();
}));
await browser.close();

// manifest: merge with any previous run so single-asset renders don't drop the others
const mf = path.join(OUT, 'manifest.json');
const prev = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : { assets: {} };
for (const r of results) prev.assets[r.id] = r;
prev.fps = FPS; prev.size = `${W}x${H}`; prev.bpm = BPM; prev.beat = +BEAT.toFixed(4);
prev.note = 'hits = seconds from clip start where an animation lands; place a clip so its hits fall on music beats (beats.json). Alpha clips are ProRes 4444; overlay with: ffmpeg -i bg.mp4 -i clip.mov -filter_complex "[0][1]overlay=0:0:eof_action=pass" ...';
fs.writeFileSync(mf, JSON.stringify(prev, null, 1));
console.log(`done: ${results.length} assets in ${((Date.now() - t0) / 1000).toFixed(0)} s (bpm ${BPM})`);
