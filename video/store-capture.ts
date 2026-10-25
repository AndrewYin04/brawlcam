// Store page captures: screenshots for review and the v3 store shot (one fighter switching between two skins).
//   BASE_URL=http://localhost:4180 npx tsx video/store-capture.ts shots   -> video/out/store-*.png
//   BASE_URL=http://localhost:4180 npx tsx video/store-capture.ts video   -> video/out/store_v3.mp4 (1920x1080, 30 fps, ~6.5 s)
import { chromium, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, readdirSync, renameSync } from 'fs';
import { resolve } from 'path';
import { GL_ARGS } from '../playwright.config';

const BASE = process.env.BASE_URL ?? 'http://localhost:4180';
const OUT = resolve(import.meta.dirname, 'out');
mkdirSync(OUT, { recursive: true });
const errors: string[] = [];

async function openStore(page: Page, ownAll = false) {
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?nocomment&notut`);
  await page.evaluate((all) => {
    localStorage.clear();
    if (all) localStorage.setItem('throwhands.owned', JSON.stringify(['crimson', 'azure']));
  }, ownAll);
  await page.reload();
  await page.waitForSelector('[data-action=store]', { state: 'visible' });
  await page.click('[data-action=store]');
  await page.waitForSelector('#skins .card .skin-art');
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('#skins img, #stage-img')].every((i) => i.complete && i.naturalWidth > 0));
}

async function shots() {
  const b = await chromium.launch({ args: GL_ARGS });
  const desk = await b.newPage({ viewport: { width: 1280, height: 1500 } });
  await openStore(desk);
  await desk.screenshot({ path: resolve(OUT, 'store-desktop.png'), fullPage: true });
  await desk.hover('#skins .card[data-skin=azure] .skin-art');
  await desk.waitForTimeout(1800);
  await desk.screenshot({ path: resolve(OUT, 'store-hover-azure.png') });
  // Buy + equip gold: the gold tile gets the equipped mark.
  await desk.click('#skins .card[data-skin=gold] button');
  await desk.click('#skins .card[data-skin=gold] button');
  await desk.mouse.move(5, 5);
  await desk.waitForTimeout(800);
  await desk.screenshot({ path: resolve(OUT, 'store-equipped-gold.png'), fullPage: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mob = await ctx.newPage();
  await openStore(mob);
  await mob.tap('#skins .card[data-skin=void] .skin-art');
  await mob.waitForTimeout(1500);
  await mob.screenshot({ path: resolve(OUT, 'store-mobile-tap-void.png'), fullPage: true });
  await b.close();
}

async function video() {
  const tmp = resolve(OUT, 'store-rec');
  rmSync(tmp, { recursive: true, force: true });
  const b = await chromium.launch({ args: GL_ARGS });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: tmp, size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await openStore(page, true);
  // Larger page text for a 1080p video frame, and the fitting room plus the first row in view.
  await page.addStyleTag({ content: 'html{zoom:1.45}' });
  await page.evaluate(() => document.getElementById('skin-stage')!.scrollIntoView({ block: 'start' }));
  await page.mouse.move(1900, 1000);
  await page.waitForTimeout(400);
  const ready = (Date.now() - t0) / 1000;
  const box = async (id: string) => (await page.locator(`#skins .card[data-skin=${id}] .skin-art`).boundingBox())!;
  const at = async (id: string) => {
    const r = await box(id);
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 12 });
  };
  await at('crimson'); // equipped, spinning in the tile and the fitting room
  await page.waitForTimeout(2300);
  await at('azure');
  await page.waitForTimeout(1200);
  await page.click('#skins .card[data-skin=azure] button'); // Equip
  await page.waitForTimeout(2200);
  await ctx.close();
  await b.close();
  const webm = readdirSync(tmp).find((f) => f.endsWith('.webm'))!;
  const src = resolve(tmp, webm);
  const out = resolve(OUT, 'store_v3.mp4');
  // Trim the page load, keep 6.5 s, constant 30 fps.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ready.toFixed(2), '-i', src, '-t', '6.5', '-r', '30', '-vf', 'scale=1920:1080,format=yuv420p', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-an', out]);
  renameSync(src, resolve(OUT, 'store_v3_raw.webm'));
  rmSync(tmp, { recursive: true, force: true });
  console.log('wrote', out);
}

const mode = process.argv[2] ?? 'shots';
await (mode === 'video' ? video() : shots());
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
