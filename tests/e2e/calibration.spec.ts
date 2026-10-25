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

test('movement tutorial: each direction lights up and fills, then the match starts', async () => {
  const b = await chromium.launch({ args: GL_ARGS });
  const q = TQ.replace('&notut', '');
  const { page } = await openPage(b, `/?mode=practice&${q}`, {}, async (ctx) => injectCamera(ctx, 'guard_02'));
  await page.waitForSelector('#tut:not(.hidden)', { timeout: 90_000 });
  const shot = (n: string) => page.screenshot({ path: `test-results/tutorial-${n}.png` });
  await shot('start');
  const cam = (f: string, v: number) => page.evaluate(([f, v]) => (window as any).__cam[f](v), [f, v] as const);
  // Advance: get bigger in the frame (step/lean toward the camera); retreat: smaller; strafe: lean the upper body sideways.
  // Left/right by stepping sideways (whole body shifts in the raw image; +x is the player's own left).
  const steps: [string, string, number][] = [['fwd', 'zoom', 1.3], ['back', 'zoom', 0.78], ['left', 'offset', 70], ['right', 'offset', -70]];
  for (const [dir, f, v] of steps) {
    await cam(f, v);
    await page.waitForFunction((d) => (window as any).__brawl.tutorial?.done.includes(d), dir, { timeout: 6_000 }).catch(() => {});
    await shot(dir);
    await cam(f, f === 'zoom' ? 1 : 0);
    await page.waitForTimeout(500);
  }
  const tut = await page.evaluate(() => (window as any).__brawl.tutorial);
  console.log('TUTORIAL', JSON.stringify(tut));
  await page.waitForFunction(() => (window as any).__brawl.tutorial?.active === false, null, { timeout: 20_000 });
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 15_000 });
  // In the match, the HUD movement indicator lights the direction you are moving.
  await cam('zoom', 1.3);
  await expect(page.locator('#move-ind i[data-d="fwd"].on')).toBeVisible({ timeout: 5_000 });
  await shot('hud-fwd');
  await cam('zoom', 1);
  expect(tut.done.sort()).toEqual(['back', 'fwd', 'left', 'right']);
  await b.close();
});

test('lean sideways also strafes (tutorial left/right by leaning)', async () => {
  const b = await chromium.launch({ args: GL_ARGS });
  const { page } = await openPage(b, `/?mode=practice&${TQ.replace('&notut', '')}`, {}, async (ctx) => injectCamera(ctx, 'guard_02'));
  await page.waitForSelector('#tut:not(.hidden)', { timeout: 90_000 });
  for (const [dir, k] of [['left', -0.22], ['right', 0.22]] as const) {
    await page.evaluate((k) => (window as any).__cam.skew(k), k);
    await page.waitForFunction((d) => (window as any).__brawl.tutorial?.done.includes(d), dir, { timeout: 6_000 });
    await page.evaluate(() => (window as any).__cam.skew(0));
    await page.waitForTimeout(400);
  }
  await b.close();
});
