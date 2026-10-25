import { test, expect, chromium } from '@playwright/test';
import { openPage, injectCamera, TQ } from './helpers';
import { GL_ARGS } from '../../playwright.config';

test('guided research drills: prompts one at a time, labels from the script, results and summary, files saved', async () => {
  test.setTimeout(8 * 60_000);
  const b = await chromium.launch({ args: GL_ARGS });
  const { page } = await openPage(b, `/?research=1&${TQ}`, { acceptDownloads: true }, (ctx) => injectCamera(ctx, 'guard_02'));
  await expect(page.locator('.research-consent')).toBeVisible({ timeout: 60_000 });
  await page.locator('#rc-ok').check();
  await page.locator('#rc-drills').click();
  await expect(page.locator('#drill')).toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: 'test-results/drills-still.png' });
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  // Drive the camera from the prompt on screen: punching clip for punch prompts, picture moves for movement prompts.
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < 6 * 60_000) {
    if (await page.locator('#drill-close').isVisible().catch(() => false)) break;
    const prompt = (await page.locator('#drill-prompt').textContent().catch(() => '')) ?? '';
    if (prompt !== last) {
      last = prompt;
      const cam = (f: string, ...a: unknown[]) => page.evaluate(([f, a]) => (window as any).__cam[f as string](...(a as unknown[])), [f, a] as const);
      await cam('zoom', 1);
      await cam('offset', 0);
      await cam('skew', 0);
      if (/HOOK|STRAIGHT|UPPERCUT/.test(prompt)) await cam('set', /UPPERCUT/.test(prompt) ? 'uppercut_01' : /HOOK/.test(prompt) ? 'hook_01' : 'jab_01');
      else await cam('set', 'guard_02');
      if (/TOWARD THE CAMERA/.test(prompt)) await cam('zoom', 1.3);
      if (/STEP BACK|LEAN BACK/.test(prompt)) await cam('zoom', 0.78);
      if (/STEP TO YOUR LEFT/.test(prompt)) await cam('offset', 70);
      if (/STEP TO YOUR RIGHT/.test(prompt)) await cam('offset', -70);
      if (/LEAN TO YOUR LEFT/.test(prompt)) await cam('skew', -0.22);
      if (/LEAN TO YOUR RIGHT/.test(prompt)) await cam('skew', 0.22);
      if (/BIG|UPPERCUT/.test(prompt) && Math.random() < 0.05) await page.screenshot({ path: 'test-results/drills-punch.png' });
    }
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: 'test-results/drills-summary.png' });
  const summary = await page.evaluate(() => (window as any).__brawl.drills);
  await page.waitForTimeout(2000);
  console.log('DRILLS', JSON.stringify({ summary, downloads }));
  expect(summary.length).toBe(3);
  expect(summary[0].drift).toBeLessThan(40); // standing still: little movement input
  expect(summary[1].hit).toBeGreaterThanOrEqual(3); // big punches detected
  expect(summary[2].hit).toBeGreaterThanOrEqual(8); // movement prompts detected
  expect(downloads.some((d) => d.endsWith('.jsonl'))).toBe(true);
  await b.close();
});
