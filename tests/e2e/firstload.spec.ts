import { test, expect, request } from '@playwright/test';
import { launchWithClip, openPage, hooks, waitScreen, realErrors, injectCamera, BASE_URL, TQ } from './helpers';
import { chromium } from '@playwright/test';
import { GL_ARGS } from '../../playwright.config';

test('desktop: camera allowed, game starts, no console errors', async () => {
  const b = await launchWithClip('jab_01');
  const { page, consoleErrors } = await openPage(b, `/?${TQ}`);
  await waitScreen(page, 'menu');
  await page.click('[data-action=practice]');
  await page.waitForSelector('#calib:not(.hidden)', { timeout: 30_000 });
  await page.click('#calib-skip');
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 20_000 });
  await page.waitForTimeout(3000);
  const h = await hooks(page);
  expect(h.delegate).toBe(process.env.PW_GL === 'swiftshader' ? 'CPU' : 'GPU');
  expect(h.poseFps).toBeGreaterThan(3);
  expect(realErrors(consoleErrors)).toEqual([]);
  await b.close();
});

test('phone landscape and portrait viewports: HUD fits, game runs', async () => {
  for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const b = await launchWithClip('jab_01');
    const { page, consoleErrors } = await openPage(b, `/?mode=practice&skipcal&${TQ}`, { viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await waitScreen(page, 'game');
    await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 20_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const bars = await page.locator('.bars').boundingBox();
    expect(bars!.width).toBeLessThanOrEqual(vp.width);
    await page.screenshot({ path: `test-results/phone-${vp.width}x${vp.height}.png` });
    expect(realErrors(consoleErrors)).toEqual([]);
    await b.close();
  }
});

test('camera denied: clear message and a retry button', async () => {
  // --use-fake-ui-for-media-stream=deny makes Chromium answer the permission prompt with "Block" (NotAllowedError),
  // the same error a user gets by denying the prompt.
  const b = await chromium.launch({ args: [...GL_ARGS, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream=deny'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  await page.goto(BASE_URL + `/?${TQ}`);
  await waitScreen(page, 'menu');
  await page.click('[data-action=practice]');
  await waitScreen(page, 'camera', 20_000);
  await expect(page.locator('#cam-title')).toHaveText('Camera blocked');
  await expect(page.locator('#cam-msg')).toContainText('Allow camera access');
  await expect(page.locator('#cam-retry')).toBeVisible();
  // Retry asks again (still denied here) and keeps showing the same clear message without breaking.
  const before = (await hooks(page)).errors.filter((e) => e === 'camera:denied').length;
  await page.click('#cam-retry');
  await page.waitForFunction((n) => (window as any).__brawl.errors.filter((e: string) => e === 'camera:denied').length > n, before, { timeout: 10_000 });
  await expect(page.locator('#cam-title')).toHaveText('Camera blocked');
  await b.close();
});

test('no camera device: message plus demo mode against the bot', async () => {
  const b = await chromium.launch({ args: GL_ARGS });
  const { page, consoleErrors } = await openPage(b, `/?${TQ}`, {}, (ctx) => injectCamera(ctx, 'jab_01', 'NotFoundError'));
  await waitScreen(page, 'menu');
  await page.click('[data-action=practice]');
  await waitScreen(page, 'camera', 20_000);
  await expect(page.locator('#cam-title')).toHaveText('No camera found');
  await page.click('#cam-demo');
  await waitScreen(page, 'game');
  await page.waitForFunction(() => (window as any).__brawl.events.filter((e: any) => e.type === 'hit').length >= 3, null, { timeout: 40_000 });
  const h = await hooks(page);
  expect(h.mode).toBe('demo');
  expect(realErrors(consoleErrors)).toEqual([]);
  await b.close();
});

test('HTTPS required: plain HTTP redirects to HTTPS', async () => {
  const ctx = await request.newContext();
  const httpUrl = BASE_URL.replace('https://', 'http://');
  const r = await ctx.get(httpUrl + '/', { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(r.status());
  expect(r.headers()['location']).toMatch(/^https:\/\//);
  await ctx.dispose();
});

test('slow 3G: loading screen shows progress and the models load', async () => {
  test.setTimeout(10 * 60_000);
  const b = await chromium.launch({ args: GL_ARGS });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // Chrome DevTools "Slow 3G" preset values: 400 ms latency, ~500 kbit/s down, ~500 kbit/s up.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8 });
  const t0 = Date.now();
  await page.goto(BASE_URL + `/?${TQ}`, { timeout: 120_000 });
  await expect(page.locator('#screen-loading')).toBeVisible();
  const widths: number[] = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    widths.push(await page.evaluate(() => parseFloat((document.getElementById('load-bar') as HTMLElement).style.width) || 0));
  }
  console.log('SLOW3G progress %', JSON.stringify(widths));
  expect(widths[widths.length - 1]).toBeGreaterThan(widths[0]);
  await waitScreen(page, 'menu', 9 * 60_000);
  console.log('SLOW3G menu after', ((Date.now() - t0) / 1000).toFixed(0), 's');
  await b.close();
});
