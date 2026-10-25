import { test, expect } from '@playwright/test';
import { launchWithClip, openPage, hooks, waitScreen, realErrors, TQ } from './helpers';

// Practice vs bot, driven by real people's movement from video clips (fake webcam).
// botlevel=-1 is a passive dummy, 3 is aggressive; roundsecs shortens rounds for the timing paths.

async function play(clip: string, q: string, until: (h: any) => boolean, timeoutMs: number) {
  const browser = await launchWithClip(clip);
  const { page, consoleErrors } = await openPage(browser, `/?mode=practice&skipcal&${TQ}&${q}`);
  await waitScreen(page, 'game');
  await page.waitForFunction(until, null, { timeout: timeoutMs, polling: 500 });
  const h = await hooks(page);
  return { browser, page, h, consoleErrors };
}
const evs = (h: any, type: string) => h.events.filter((e: any) => e.type === type);

test('won by KO (passive bot, jab clip)', async () => {
  test.setTimeout(240_000);
  const { browser, page, h, consoleErrors } = await play('jab_01', 'botlevel=-1', () => (window as any).__brawl.snapshot?.phase === 'match_over', 220_000);
  const me = h.snapshot.f.find((f: any) => !f.bot);
  console.log('WON_KO', JSON.stringify({ winner: h.snapshot.winner, me: me.id, rounds: evs(h, 'round_end').map((e: any) => e.reason), hits: evs(h, 'hit').length, actions: h.localActions.length, fps: h.poseFps }));
  expect(h.snapshot.winner).toBe(me.id);
  expect(evs(h, 'round_end').some((e: any) => e.reason === 'ko')).toBeTruthy();
  await page.waitForSelector('#screen-results.active', { timeout: 10_000 });
  await expect(page.locator('#res-title')).toHaveText('YOU WIN!');
  expect(realErrors(consoleErrors)).toEqual([]);
  // Rematch starts a new match.
  await page.click('#res-rematch');
  await waitScreen(page, 'game', 10_000);
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.round === 1 && (window as any).__brawl.snapshot?.phase !== 'match_over', null, { timeout: 10_000 });
  await browser.close();
});

test('lost by KO (aggressive bot, idle guard clip)', async () => {
  test.setTimeout(240_000);
  const { browser, page, h } = await play('guard_02', 'botlevel=3', () => (window as any).__brawl.snapshot?.phase === 'match_over', 220_000);
  const me = h.snapshot.f.find((f: any) => !f.bot);
  console.log('LOST_KO', JSON.stringify({ winner: h.snapshot.winner, me: me.id, rounds: evs(h, 'round_end').map((e: any) => e.reason) }));
  expect(h.snapshot.winner).not.toBe(me.id);
  expect(h.snapshot.winner).not.toBeNull();
  expect(evs(h, 'round_end').filter((e: any) => e.reason === 'ko').length).toBeGreaterThanOrEqual(2);
  await page.waitForSelector('#screen-results.active', { timeout: 10_000 });
  await expect(page.locator('#res-title')).toHaveText('YOU LOSE');
  await browser.close();
});

test('won on time (short rounds, passive bot)', async () => {
  test.setTimeout(120_000);
  const { browser, h } = await play('jab_01', 'botlevel=-1&roundsecs=12', () => (window as any).__brawl.events.some((e: any) => e.type === 'round_end'), 60_000);
  const re = evs(h, 'round_end')[0];
  const me = h.snapshot.f.find((f: any) => !f.bot);
  console.log('WON_TIME', JSON.stringify({ re, hp: h.snapshot.f.map((f: any) => f.hp) }));
  expect(re.reason).toBe('time');
  expect(re.winner).toBe(me.id);
  await browser.close();
});

test('drawn round (nobody lands a hit)', async () => {
  test.setTimeout(120_000);
  const { browser, page, h } = await play('guard_02', 'botlevel=-1&roundsecs=8', () => (window as any).__brawl.events.some((e: any) => e.type === 'round_end'), 60_000);
  const re = evs(h, 'round_end')[0];
  console.log('DRAW', JSON.stringify({ re, hp: h.snapshot.f.map((f: any) => f.hp), banner: await page.textContent('#banner') }));
  expect(re.reason).toBe('time');
  expect(re.winner).toBeNull();
  // The match continues with round 2 after a draw.
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.round === 2, null, { timeout: 20_000 });
  await browser.close();
});

test('quit to menu mid-round', async () => {
  test.setTimeout(90_000);
  const { browser, page, consoleErrors } = await play('jab_01', 'botlevel=1', () => (window as any).__brawl.snapshot?.phase === 'fight', 30_000);
  await page.waitForTimeout(2000);
  await page.click('#btn-quit');
  await waitScreen(page, 'menu', 5000);
  await expect(page.locator('#screen-menu')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(realErrors(consoleErrors)).toEqual([]);
  await browser.close();
});
