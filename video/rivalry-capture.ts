// Plays one real online match between two test clips (camera preview hidden: no footage on screen) and captures the
// results screen with the server-generated rivalry card (live Muse Spark + Muse Image: 2 Meta calls).
import { chromium } from '@playwright/test';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = process.env.BASE_URL ?? 'https://144-202-71-213.sslip.io';
const launch = (clip: string) => chromium.launch({ args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${path.join(ROOT, 'clips', clip + '.mjpeg')}`] });
async function page(b: any, nick: string, url: string) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] });
  await ctx.addInitScript((n: string) => localStorage.setItem('throwhands.nick', n), nick);
  const p = await ctx.newPage();
  await p.goto(url);
  return p;
}
const [NA, NB, CA, CB] = [process.env.NA ?? 'Demo Maya', process.env.NB ?? 'Demo Leo', process.env.CA ?? 'jab_01', process.env.CB ?? 'guard_02'];
const FIX = process.env.FIXTURE ? '&aifixture' : '';
const A = await launch(CA);
const B = await launch(CB);
const pa = await page(A, NA, `${BASE}/?clean&skipcal&nocomment&roundsecs=30${FIX}`);
await pa.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 90000 });
await pa.click('[data-action=online-create]');
await pa.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 20000 });
const room = await pa.evaluate(() => (window as any).__brawl.online.room);
const pb = await page(B, NB, `${BASE}/?room=${room}&clean&skipcal&nocomment${FIX}`);
await pb.waitForFunction(() => (window as any).__brawl?.screen === 'lobby', null, { timeout: 90000 });
await pa.click('#lobby-start');
await pa.waitForSelector('#screen-results.active', { timeout: 300000 });
await pa.waitForFunction(() => (window as any).__brawl.rivalry, null, { timeout: 40000 });
await pa.waitForTimeout(2500);
if (!process.env.NOSHOT) await pa.screenshot({ path: path.join(ROOT, 'video/out/ui/rivalry.png') });
console.log('rivalry', JSON.stringify(await pa.evaluate(() => (window as any).__brawl.rivalry)));
await A.close();
await B.close();
