import { test, expect, chromium } from '@playwright/test';
import { openPage, injectCamera, waitScreen, realErrors, TQ } from './helpers';
import { GL_ARGS } from '../../playwright.config';

// REVIEW.md 10:59 AM smoke check: grappling is on by default, so with no ?grapple flag a practice match registers the
// user's own grab reps (session 2 webcam, 80.5-94.5 s: the same reps as clips/landmarks/user_grab.json).
test('grappling on by default: the user\'s grab registers in a practice match (no ?grapple flag)', async () => {
  test.setTimeout(150_000);
  const browser = await chromium.launch({ args: GL_ARGS });
  const { page, consoleErrors } = await openPage(browser, `/?mode=practice&skipcal&${TQ}&botlevel=-1`, {}, (ctx) => injectCamera(ctx, 'usergrab_01'));
  await waitScreen(page, 'game');
  await page.waitForFunction(() => (window as any).__brawl.localActions?.some((a: any) => (a.kind ?? a.a?.kind ?? a[1]) === 'grab' || JSON.stringify(a).includes('"grab"')), null, { timeout: 100_000, polling: 250 });
  const h = await page.evaluate(() => ({ acts: (window as any).__brawl.localActions, grapple: (window as any).__brawl.grappleEnabled?.(), ev: (window as any).__brawl.events.filter((e: any) => /clinch|grab|throw/.test(e.type)).map((e: any) => e.type) }));
  console.log('GRAB_DEFAULT', JSON.stringify({ grappleEnabled: h.grapple, actions: h.acts.map((a: any) => a.kind ?? JSON.stringify(a).slice(0, 40)).slice(-12), grappleEvents: h.ev }));
  expect(realErrors(consoleErrors)).toEqual([]);
  await browser.close();
});
