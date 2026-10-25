import { test, expect, chromium } from '@playwright/test';
import { openPage, injectCamera, TQ } from './helpers';
import { GL_ARGS } from '../../playwright.config';

test('announcer: instant stock calls on big moments, within the spoken budget, never the robotic browser voice', async () => {
  test.setTimeout(150_000);
  const b = await chromium.launch({ args: [...GL_ARGS, '--autoplay-policy=no-user-gesture-required'] });
  const { page } = await openPage(b, `/?mode=practice&skipcal&${TQ}&botlevel=3&roundsecs=45`, {}, async (ctx) => {
    await injectCamera(ctx, 'jab_01');
    await ctx.addInitScript(() => {
      (window as any).__ttsCalls = 0;
      if (window.speechSynthesis) window.speechSynthesis.speak = () => ((window as any).__ttsCalls++, undefined);
    });
  });
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 90_000 });
  await page.waitForTimeout(40_000);
  const log = await page.evaluate(() => (window as any).__brawl.announcer());
  const tts = await page.evaluate(() => (window as any).__ttsCalls);
  const events = await page.evaluate(() => (window as any).__brawl.events.map((e: any) => e.type));
  const counts = events.reduce((m: any, t: string) => ((m[t] = (m[t] ?? 0) + 1), m), {});
  const per = log.filter((c: any) => !['round1', 'round2', 'round3', 'fight', 'ko', 'match_over', 'draw', 'time'].includes(c.key));
  const span = log.length > 1 ? (log[log.length - 1].at - log[0].at) / 1000 : 0;
  console.log('ANNOUNCER', JSON.stringify({ calls: log.map((c: any) => `${c.key}:${c.text}`), events: counts, browserVoiceCalls: tts, spanSec: span }));
  expect(log.some((c: any) => c.key.startsWith('round') || c.key === 'fight')).toBe(true);
  expect(log.length).toBeGreaterThanOrEqual(2);
  // Spoken budget: at most 8 non-essential calls in any 60 s window (this run is under a minute).
  expect(per.length).toBeLessThanOrEqual(8);
  expect(tts).toBe(0);
  await b.close();
});
