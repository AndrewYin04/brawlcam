import { test, expect } from '@playwright/test';
import { openPage, hooks, waitScreen, injectCamera, realErrors, TQ } from './helpers';
import { chromium } from '@playwright/test';
import { GL_ARGS } from '../../playwright.config';

// Two real people side by side on one camera: two clips composed into one frame by the injected camera.
async function start(q = '') {
  const b = await chromium.launch({ args: GL_ARGS });
  const r = await openPage(b, `/?mode=local2p&skipcal&${TQ}${q}`, {}, (ctx) => injectCamera(ctx, 'jab_01|shadow_fighterF'));
  await waitScreen(r.page, 'game');
  await r.page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 30_000 });
  return { b, ...r };
}

test('full local 2-player match: both people control their own fighter', async () => {
  test.setTimeout(8 * 60_000);
  const { b, page, consoleErrors } = await start('&roundsecs=30');
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'match_over', null, { timeout: 7 * 60_000, polling: 1000 });
  const h = await hooks(page);
  const byPlayer = [0, 1].map((i) => h.localActions.filter((a: any) => a.player === i).length);
  console.log('LOCAL2P', JSON.stringify({ winner: h.snapshot.winner, byPlayer, hits: h.events.filter((e: any) => e.type === 'hit').length, rounds: h.events.filter((e: any) => e.type === 'round_end').map((e: any) => [e.winner, e.reason]) }));
  expect(byPlayer[0]).toBeGreaterThan(0);
  expect(byPlayer[1]).toBeGreaterThan(0);
  expect(realErrors(consoleErrors)).toEqual([]);
  await b.close();
});

test('one player leaves the frame mid-round: their fighter idles, no crash; both leave', async () => {
  test.setTimeout(120_000);
  const { b, page, consoleErrors } = await start();
  await page.waitForTimeout(3000);
  // Mask the raw-image right half: that is the person on the LEFT of the mirrored preview (player 1).
  await page.evaluate(() => (window as any).__cam.mask('right'));
  await page.waitForFunction(() => { const f = (window as any).__brawl.snapshot.f; return f[0].pr === 0 && f[1].pr === 1; }, null, { timeout: 15_000 });
  await page.waitForTimeout(3000);
  let h = await hooks(page);
  expect(h.snapshot.phase).not.toBe('waiting');
  await page.evaluate(() => (window as any).__cam.blank(true));
  await page.waitForFunction(() => (window as any).__brawl.snapshot.f.every((f: any) => f.pr === 0), null, { timeout: 15_000 });
  await page.waitForTimeout(3000);
  // Both come back.
  await page.evaluate(() => { (window as any).__cam.blank(false); (window as any).__cam.mask(null); });
  await page.waitForFunction(() => (window as any).__brawl.snapshot.f.every((f: any) => f.pr === 1), null, { timeout: 15_000 });
  h = await hooks(page);
  expect(realErrors(consoleErrors)).toEqual([]);
  expect(h.errors).toEqual([]);
  await b.close();
});
