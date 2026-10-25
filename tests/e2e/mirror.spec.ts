import { test, expect } from '@playwright/test';
import { launchWithClip, openPage, waitScreen, TQ } from './helpers';

// Spec P0: within 5 s of granting camera access, the fighter mirrors the player (here: during calibration).
test('fighter mirrors the player within 5 s of camera access', async () => {
  const b = await launchWithClip('guard_02');
  const { page } = await openPage(b, `/?${TQ}`);
  await waitScreen(page, 'menu');
  await page.click('[data-action=practice]');
  await page.waitForFunction(() => (window as any).__brawl.mirrorAt, null, { timeout: 20_000 });
  const ms = await page.evaluate(() => (window as any).__brawl.mirrorAt - (window as any).__brawl.cameraAt);
  console.log('MIRROR ms after camera access:', Math.round(ms));
  expect(ms).toBeLessThan(5000);
  await b.close();
});
