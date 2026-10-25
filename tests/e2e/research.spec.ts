import { test, expect, chromium } from '@playwright/test';
import fs from 'fs';
import { openPage, injectCamera, TQ, BASE_URL } from './helpers';
import { GL_ARGS } from '../../playwright.config';

test('research mode: consent first, records locally, markers, both files download, landmarks (no video) reach the server', async () => {
  test.setTimeout(150_000);
  const before = await (await fetch(BASE_URL + '/api/research/stats')).json().catch(() => null);
  const b = await chromium.launch({ args: GL_ARGS });
  const { page } = await openPage(b, `/?research=1&mode=practice&skipcal&${TQ}`, { acceptDownloads: true }, (ctx) => injectCamera(ctx, 'jab_01'));
  // Nothing starts without the checkbox: Start is disabled until ticked.
  await expect(page.locator('.research-consent')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#rc-start')).toBeDisabled();
  await page.screenshot({ path: 'test-results/research-consent.png' });
  await page.locator('#rc-ok').check();
  await page.locator('#rc-start').click();
  await expect(page.locator('#research-bar')).toBeVisible({ timeout: 90_000 });
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 90_000 });
  await page.waitForTimeout(2500);
  await page.keyboard.press('1'); // "I just did a jab"
  await page.waitForTimeout(800);
  await page.keyboard.press('Space'); // missed move
  await page.waitForTimeout(800);
  await page.keyboard.press('f'); // false fire
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/research-recording.png' });
  const downloads: { name: string; path: string }[] = [];
  page.on('download', async (d) => downloads.push({ name: d.suggestedFilename(), path: (await d.path())! }));
  await page.locator('#research-stop').click();
  await page.waitForFunction(() => (window as any).__brawl.research?.saved, null, { timeout: 20_000 });
  await expect.poll(() => downloads.length, { timeout: 15_000 }).toBe(2);
  await page.waitForTimeout(1000);
  const jsonl = downloads.find((d) => d.name.endsWith('.jsonl'))!;
  const webm = downloads.find((d) => /\.(webm|mp4)$/.test(d.name))!;
  const lines = fs.readFileSync(jsonl.path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const frames = lines.filter((l) => l.world);
  const markers = lines.filter((l) => l.marker && !l.world).map((l) => l.marker);
  const actions = frames.flatMap((l) => l.actions ?? []);
  const events = lines.filter((l) => l.event).map((l) => l.event.type);
  const stats = await page.evaluate(() => (window as any).__brawl.research);
  const after = await (await fetch(BASE_URL + '/api/research/stats')).json();
  console.log('RESEARCH', JSON.stringify({ files: downloads.map((d) => [d.name, fs.statSync(d.path).size]), jsonlFrames: frames.length, worldPoints: frames[0]?.world?.length, imagePoints: frames[0]?.image?.length, markers, actions: actions.length, events: [...new Set(events)], stats, serverBefore: before, serverAfter: after }));
  expect(frames.length).toBeGreaterThan(60);
  expect(frames[0].world.length).toBe(33);
  expect(frames[0].image[0].length).toBe(4);
  expect(markers).toEqual(['did:jab', 'missed', 'false_fire']);
  expect(fs.statSync(webm.path).size).toBeGreaterThan(50_000);
  expect(stats.sent).toBeGreaterThan(30);
  expect(after.frames).toBeGreaterThan((before?.frames ?? 0) + 30);
  await b.close();
});

test('research mode: declining plays normally and records nothing', async () => {
  const b = await chromium.launch({ args: GL_ARGS });
  const { page } = await openPage(b, `/?research=1&mode=practice&skipcal&${TQ}`, {}, (ctx) => injectCamera(ctx, 'jab_01'));
  await expect(page.locator('.research-consent')).toBeVisible({ timeout: 60_000 });
  await page.locator('#rc-no').click();
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 90_000 });
  await expect(page.locator('#research-bar')).toHaveCount(0);
  const posted = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/api/research')).length);
  expect(posted).toBe(0);
  await b.close();
});
