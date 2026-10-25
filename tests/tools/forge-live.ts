// Live smoke: Fighter Forge through the real page (counts against the 20 live Meta calls budget: 2 calls).
import { launchWithClip } from '../e2e/helpers';
const base = process.env.BASE_URL ?? 'https://144-202-71-213.sslip.io';
const prompt = process.argv[2] ?? 'thunder penguin luchador';
const b = await launchWithClip(undefined);
const page = await (await b.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
await page.goto(base + '/?lowgfx');
await page.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 60000 });
await page.click('[data-action=forge]');
await page.fill('#forge-prompt', prompt);
const t0 = Date.now();
await page.click('#forge-go');
await page.waitForFunction(() => (window as any).__brawl?.forge?.state === 'done', null, { timeout: 30000 });
console.log('FORGE', ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(await page.evaluate(() => (window as any).__brawl.forge)), await page.textContent('#forge-status'));
await page.screenshot({ path: process.env.OUT ?? 'test-results/forge.png' });
await b.close();
