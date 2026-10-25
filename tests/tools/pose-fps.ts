// Pose rate vs renderer settings in a real practice match (fake camera = a real clip). Usage: npx tsx tests/tools/pose-fps.ts
import { chromium } from '@playwright/test';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const variants = (process.env.VARIANTS ?? ',&nobloom,&lowgfx,&classic').split(',');
for (const v of variants) {
  const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${path.join(ROOT, 'clips/guard_02.mjpeg')}`] });
  const p = await (await b.newContext({ permissions: ['camera'], viewport: { width: 1280, height: 720 } })).newPage();
  await p.goto(`${BASE}/?mode=practice&skipcal&nocomment&aifixture&notut${v}${process.env.EXTRA ?? ''}`);
  await p.waitForFunction(() => (window as any).__brawl?.snapshot?.phase === 'fight', null, { timeout: 120000 });
  const samples: any[] = [];
  for (let i = 0; i < (Number(process.env.SECS) || 8); i++) {
    await p.waitForTimeout(1000);
    samples.push(await p.evaluate(() => { const h = (window as any).__brawl; return { pose: h.poseFps, render: h.renderFps, inferMs: h.inferMs, renderMs: h.renderMs, quality: h.quality }; }));
  }
  const avg = (k: string) => +(samples.reduce((a, s) => a + (s[k] ?? 0), 0) / samples.length).toFixed(1);
  console.log(JSON.stringify({ variant: v || 'default', poseFps: avg('pose'), renderFps: avg('render'), inferMs: avg('inferMs'), renderMs: avg('renderMs'), quality: samples[samples.length - 1].quality }));
  await b.close();
}
