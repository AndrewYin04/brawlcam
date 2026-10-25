// Quick visual check: open a URL with a fake camera clip and save screenshots.
// Usage: npx tsx tests/tools/shot.ts <clip|none> <path+query> <outPrefix> [seconds...]
import { launchWithClip } from '../e2e/helpers';
const [clip, q, out, ...secs] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:4173';
const b = await launchWithClip(clip === 'none' ? undefined : clip);
const ctx = await b.newContext({ permissions: ['camera'], viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
const page = await ctx.newPage();
const logs: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(base + q);
let elapsed = 0;
for (const s of (secs.length ? secs : ['8']).map(Number)) {
  await page.waitForTimeout((s - elapsed) * 1000); elapsed = s;
  await page.screenshot({ path: `${out}_${s}s.png` });
}
const h = await page.evaluate(() => { const b = (window as any).__brawl; return { inferMs: b.inferMs, renderMs: b.renderMs, loopMs: b.loopMs, screen: b.screen, mode: b.mode, delegate: b.delegate, poseFps: b.poseFps, renderFps: b.renderFps, actions: b.localActions.length, events: b.events.map((e: any) => e.type).reduce((m: any, t: string) => ((m[t] = (m[t] ?? 0) + 1), m), {}), errors: b.errors, gesture: b.lastGesture }; });
console.log(JSON.stringify(h));
console.log(logs.slice(0, 15).join('\n'));
await b.close();
