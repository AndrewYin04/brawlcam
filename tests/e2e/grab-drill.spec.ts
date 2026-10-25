import { test, expect, chromium } from '@playwright/test';
import { openPage, injectCamera, TQ } from './helpers';
import { GL_ARGS } from '../../playwright.config';

// Grab-only drill (REVIEW.md 6:35 AM): ?research=1&grapple=1&drills=grab runs one section of 8 GRAB prompts labeled
// 'grab', and the recognizer runs with grappleEnabled. Without ?grapple=1 the "Grab drill" button does not exist.
test('grab-only drill: 8 GRAB prompts, grappleEnabled recognizer, summary and files', async () => {
  test.setTimeout(4 * 60_000);
  const b = await chromium.launch({ args: GL_ARGS });
  const { page } = await openPage(b, `/?research=1&grapple=1&drills=grab&${TQ}`, { acceptDownloads: true }, (ctx) => injectCamera(ctx, 'guard_02'));
  await expect(page.locator('.research-consent')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#rc-grab')).toBeVisible();
  await page.locator('#rc-ok').check();
  await page.locator('#rc-grab').click();
  await expect(page.locator('#drill')).toBeVisible({ timeout: 120_000 });
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  const prompts = new Set<string>();
  const counts: string[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 3 * 60_000) {
    if (await page.locator('#drill-close').isVisible().catch(() => false)) break;
    prompts.add(((await page.locator('#drill-prompt').textContent().catch(() => '')) ?? '').trim());
    const c = ((await page.locator('#drill-count').textContent().catch(() => '')) ?? '').trim();
    if (c && counts[counts.length - 1] !== c) counts.push(c);
    await page.waitForTimeout(200);
  }
  const grappleOn = await page.evaluate(() => (window as any).__brawl.grappleEnabled?.());
  const summary = await page.evaluate(() => (window as any).__brawl.drills);
  await page.screenshot({ path: 'test-results/grab-drill-summary.png' });
  console.log('GRAB DRILL', JSON.stringify({ prompts: [...prompts], counts, summary, downloads, grappleOn }));
  expect(summary.length).toBe(1);
  expect(summary[0].section).toBe('Grab drill (beta)');
  expect(summary[0].asked).toBe(8);
  expect([...prompts].filter((p) => p && p !== 'Get ready')).toEqual(['GRAB: REACH BOTH ARMS, PULL IN']);
  expect(counts[counts.length - 1]).toBe('8 / 8');
  expect(grappleOn).toEqual([true]);
  await page.waitForTimeout(2000);
  expect(downloads.some((d) => d.endsWith('.jsonl'))).toBe(true);
  await b.close();
});

test('grappling off (?grapple=0): no Grab drill button', async () => {
  const b = await chromium.launch({ args: GL_ARGS });
  const { page } = await openPage(b, `/?research=1&drills=grab&grapple=0&${TQ}`, {}, (ctx) => injectCamera(ctx, 'guard_02'));
  await expect(page.locator('.research-consent')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#rc-drills')).toBeVisible();
  expect(await page.locator('#rc-grab').count()).toBe(0);
  await b.close();
});
