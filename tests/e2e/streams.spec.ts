import { test, expect, chromium } from '@playwright/test';
import { openPage, injectCamera, TQ, BASE_URL } from './helpers';
import { GL_ARGS } from '../../playwright.config';

test('motion-data consent on: the session streams 15 fps landmarks to the server; consent off: nothing is sent', async () => {
  test.setTimeout(150_000);
  const before = await (await fetch(BASE_URL + '/api/pose-stream/stats')).json();
  const b = await chromium.launch({ args: GL_ARGS });
  const { page } = await openPage(b, `/?mode=practice&skipcal&${TQ}&roundsecs=60`, {}, async (ctx) => {
    await injectCamera(ctx, 'jab_01');
    await ctx.addInitScript(() => localStorage.setItem('throwhands.motionConsent', 'yes'));
  });
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 90_000 });
  await page.waitForTimeout(12_000);
  const sent = await page.evaluate(() => (window as any).__brawl.motionStream().sent);
  const reqs = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/api/pose-stream')).length);
  await page.waitForTimeout(1500);
  const after = await (await fetch(BASE_URL + '/api/pose-stream/stats')).json();
  console.log('STREAM', JSON.stringify({ sentFrames: sent, batches: reqs, fpsApprox: +(sent / 12).toFixed(1), framesBefore: before.totalFrames, framesAfter: after.totalFrames, bytes: after.bytes }));
  expect(sent).toBeGreaterThan(100); // about 15 fps for ~12 s (fewer if pose runs slower than 15 fps)
  expect(reqs).toBeGreaterThanOrEqual(4); // batched every 2 s
  expect(after.totalFrames).toBeGreaterThanOrEqual(before.totalFrames + sent - 50);
  await b.close();

  // Consent off: no stream requests at all.
  const b2 = await chromium.launch({ args: GL_ARGS });
  const { page: p2 } = await openPage(b2, `/?mode=practice&skipcal&${TQ}`, {}, (ctx) => injectCamera(ctx, 'jab_01'));
  await p2.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 90_000 });
  await p2.waitForTimeout(6000);
  expect(await p2.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/api/pose-stream')).length)).toBe(0);
  await b2.close();
});
