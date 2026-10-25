import { test, expect } from '@playwright/test';
import { openPage, hooks, waitScreen, injectCamera, launchWithClip, TQ } from './helpers';
import { chromium } from '@playwright/test';
import { GL_ARGS } from '../../playwright.config';

test('guard pose detected; calibration completes in about 3 s', async () => {
  const b = await launchWithClip('guard_02');
  const { page } = await openPage(b, `/?mode=practice&${TQ}`);
  await page.waitForSelector('#calib:not(.hidden)', { timeout: 60_000 });
  const t0 = Date.now();
  await page.waitForFunction(() => (window as any).__brawl.calibrated === true, null, { timeout: 30_000 });
  const secs = (Date.now() - t0) / 1000;
  console.log('CALIB seconds', secs.toFixed(1));
  expect(secs).toBeLessThan(10);
  await expect(page.locator('#calib')).toBeHidden();
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 15_000 });
  await b.close();
});

for (const [label, zoom, expectText] of [['too close', 2.4, 'Step back'], ['too far', 0.3, 'Step closer']] as const) {
  test(`player ${label}: on-screen guidance appears`, async () => {
    const b = await chromium.launch({ args: GL_ARGS });
    const { page } = await openPage(b, `/?mode=practice&${TQ}`, {}, async (ctx) => {
      await injectCamera(ctx, 'guard_02');
      await ctx.addInitScript((z) => setTimeout(() => (window as any).__cam?.zoom(z), 0), zoom);
    });
    await page.waitForSelector('#calib:not(.hidden)', { timeout: 60_000 });
    await page.evaluate((z) => (window as any).__cam.zoom(z), zoom);
    await expect(page.locator('#calib-msg')).toContainText(expectText, { timeout: 20_000 });
    // Back to normal distance: calibration completes.
    await page.evaluate(() => (window as any).__cam.zoom(1));
    await page.waitForFunction(() => (window as any).__brawl.calibrated === true, null, { timeout: 30_000 });
    await b.close();
  });
}
