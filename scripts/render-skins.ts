// Pre-renders the store's skin previews with the game's own fighter renderer (web/src/tools/skin-render.ts):
// for every skin, a 400x500 still (web/public/skins/<id>.webp) and a slow 360-degree turntable as an animated
// WebP (web/public/skins/<id>-spin.webp). Run once after changing skins or the fighter model, then commit:
//   npx tsx scripts/render-skins.ts            (all skins)
//   npx tsx scripts/render-skins.ts gold azure (some)
// Needs ffmpeg with libwebp_anim. PNG copies for review go to video/out/skins-check (gitignored).
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { SKINS } from '../web/src/pages/skins';
import { GL_ARGS } from '../playwright.config';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'web/public/skins');
const CHECK = resolve(ROOT, 'video/out/skins-check');
const TMP = resolve(ROOT, '.render-tmp'); // not /tmp (small tmpfs)
const STILL_YAW = Number(process.env.STILL_YAW ?? 0.45); // three-quarter view
const SPIN = { frames: 72, w: 320, h: 400, fps: 12 }; // 6 s per turn

const only = process.argv.slice(2);
const skins = only.length ? SKINS.filter((s) => only.includes(s.id)) : SKINS;
const PORT = 5199;

const dataOf = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(CHECK, { recursive: true });
  const server = await createServer({ configFile: resolve(ROOT, 'web/vite.config.ts'), server: { port: PORT, strictPort: true }, logLevel: 'warn' });
  await server.listen();
  const browser = await chromium.launch({ args: GL_ARGS });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
    page.on('pageerror', (e) => console.error('[page]', e.message));
    await page.goto(`http://localhost:${PORT}/skin-render.html`);
    await page.waitForFunction(() => (window as any).skinRenderReady, null, { timeout: 60_000 });
    await page.evaluate(() => (window as any).skinRenderReady);
    for (const s of skins) {
      const still = await page.evaluate(([c, y]) => (window as any).renderSkin(c, y, 400, 500, 'image/webp', 0.9), [s.color, STILL_YAW] as const);
      writeFileSync(resolve(OUT, `${s.id}.webp`), dataOf(still));
      const png = await page.evaluate(([c, y]) => (window as any).renderSkin(c, y, 400, 500), [s.color, STILL_YAW] as const);
      writeFileSync(resolve(CHECK, `${s.id}.png`), dataOf(png));
      const dir = resolve(TMP, s.id);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      for (let i = 0; i < SPIN.frames; i++) {
        const yaw = STILL_YAW + (i / SPIN.frames) * Math.PI * 2;
        const f = await page.evaluate(([c, y, w, h]) => (window as any).renderSkin(c, y, w, h), [s.color, yaw, SPIN.w, SPIN.h] as const);
        writeFileSync(resolve(dir, `f${String(i).padStart(3, '0')}.png`), dataOf(f));
      }
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(SPIN.fps), '-i', resolve(dir, 'f%03d.png'), '-c:v', 'libwebp_anim', '-loop', '0', '-lossless', '0', '-quality', '72', '-compression_level', '6', resolve(OUT, `${s.id}-spin.webp`)]);
      rmSync(dir, { recursive: true, force: true });
      console.log('rendered', s.id);
    }
  } finally {
    await browser.close();
    await server.close();
    rmSync(TMP, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
