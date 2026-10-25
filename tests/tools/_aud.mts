import { chromium } from '@playwright/test';
import path from 'path';
// Real Chrome autoplay policy (no --autoplay-policy override), real click on the menu.
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${path.resolve('clips/jab_01.mjpeg')}`] });
const p = await (await b.newContext({ permissions: ['camera'], viewport: { width: 1280, height: 720 } })).newPage();
p.on('console', (m) => m.text().includes('udio') && console.log('console', m.text()));
await p.goto('http://localhost:4173/?nocomment&aifixture&notut&skipcal');
await p.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 90000 });
console.log('before click', JSON.stringify(await p.evaluate(() => (window as any).__brawl.audio())));
await p.click('[data-action=practice]');
await p.waitForFunction(() => (window as any).__brawl?.snapshot?.phase === 'fight', null, { timeout: 90000 });
await p.waitForTimeout(15000);
console.log('after 15 s', JSON.stringify(await p.evaluate(() => ({ audio: (window as any).__brawl.audio(), calls: (window as any).__brawl.announcer().map((c: any) => c.text) }))));
await b.close();
