import { test, expect } from '@playwright/test';
import { launchWithClip, newCamContext, BASE_URL } from './helpers';
import fs from 'fs';
import path from 'path';

const CLIP = process.env.SPIKE_CLIP;

test('WebGL canvas renders non-blank and pose model loads', async () => {
  const browser = await launchWithClip(CLIP);
  const page = await (await newCamContext(browser)).newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE_URL + '/spike.html' + (process.env.SPIKE_QS ?? ''));
  await expect.poll(() => page.evaluate(() => (window as any).__spike.status), { timeout: 60_000 }).toBe('tracking');
  // Canvas pixels: count distinct colors in a sample, a blank canvas has one.
  const distinct = await page.evaluate(() => {
    const c = document.getElementById('gl') as HTMLCanvasElement;
    const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
    const g = tmp.getContext('2d')!; g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, tmp.width, tmp.height).data; const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 97) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return set.size;
  });
  expect(distinct).toBeGreaterThan(5);
  await page.waitForTimeout(8000);
  const s = await page.evaluate(() => (window as any).__spike);
  console.log('SPIKE', JSON.stringify(s), 'distinctColors', distinct, 'consoleErrors', JSON.stringify(errors));
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: path.join('test-results', 'spike.png') });
  expect(s.frames).toBeGreaterThan(10);
  if (CLIP) expect(s.landmarks).toBe(33);
  await browser.close();
});
