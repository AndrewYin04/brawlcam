import { test, expect, type Page } from '@playwright/test';
import { launchWithClip, BASE_URL } from './helpers';

// Fighter A's clip drives browser 1, fighter B's clip drives browser 2; they play a full best-of-3 online.
const Q = '&cpu&lowgfx&skipcal';

async function open(clip: string, path: string) {
  const b = await launchWithClip(clip);
  const ctx = await b.newContext({ permissions: ['camera'], viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text()); });
  await page.goto(BASE_URL + path);
  return { b, page, errors };
}
const H = (p: Page) => p.evaluate(() => { const h = (window as any).__brawl; return { screen: h.screen, mode: h.mode, online: h.online, snap: h.snapshot, over: h.matchOver, poseFps: h.poseFps, actions: h.localActions.length, hits: h.events.filter((e: any) => e.type === 'hit').length, errors: h.errors }; });

test('fighter A vs fighter B: full online best-of-3', async () => {
  test.setTimeout(9 * 60_000);
  const A = await open('shadow_fighterA', '/?x=1' + Q);
  await A.page.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 60_000 });
  await A.page.fill('#nickname', 'E2E Fighter A');
  await A.page.dispatchEvent('#nickname', 'change');
  await A.page.click('[data-action=online-create]');
  await A.page.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 20_000 });
  const room = (await H(A.page)).online.room as string;
  expect(room).toMatch(/^[A-Z]{4}$/);
  await expect(A.page.locator('#lobby-code')).toHaveText(room);

  const B = await open('shadow_fighterB', `/?room=${room}` + Q);
  await B.page.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 60_000 });
  await expect(A.page.locator('#lobby-roster li')).toHaveCount(2);
  await A.page.click('#lobby-start');
  for (const P of [A, B]) await P.page.waitForFunction(() => (window as any).__brawl?.screen === 'game', null, { timeout: 30_000 });

  // Every 2 s, compare the two clients' snapshot logs tick by tick: same sim tick => same HP, round, timer;
  // and each tick must arrive on both clients within one network tick (50 ms) of each other.
  let samples = 0, mismatches = 0, maxArrivalSkew = 0;
  const lags: number[] = [];
  const t0 = Date.now();
  const logOf = (p: Page) => p.evaluate(() => (window as any).__brawl.snapLog.splice(0));
  while (Date.now() - t0 < 8 * 60_000) {
    const [a, b] = await Promise.all([H(A.page), H(B.page)]);
    const [la, lb] = await Promise.all([logOf(A.page), logOf(B.page)]);
    const mb = new Map(lb.map((x: any) => [x.t, x]));
    for (const x of la) {
      const y: any = mb.get(x.t);
      if (!y) continue;
      samples++;
      if (x.round !== y.round || x.timer !== y.timer || x.hp.join() !== y.hp.join()) mismatches++;
      lags.push(Math.abs(x.at - y.at));
    }
    if (a.over && b.over) break;
    await A.page.waitForTimeout(2000);
  }
  lags.sort((x, y) => x - y);
  maxArrivalSkew = lags[lags.length - 1] ?? 0;
  const p95 = lags[Math.floor(lags.length * 0.95)] ?? 0;
  const [a, b] = await Promise.all([H(A.page), H(B.page)]);
  console.log('ONLINE', JSON.stringify({ room, samples, mismatches, p95ArrivalSkewMs: Math.round(p95), maxArrivalSkewMs: Math.round(maxArrivalSkew), aOver: a.over, bOver: b.over, aHits: a.hits, bHits: b.hits, aActions: a.actions, bActions: b.actions, aFps: a.poseFps, bFps: b.poseFps, finalA: a.snap?.f.map((f: any) => [f.name, f.hp, f.rw]), errA: A.errors.slice(0, 3), errB: B.errors.slice(0, 3) }));
  expect(a.over, 'match ended on A').toBeTruthy();
  expect(b.over, 'match ended on B').toBeTruthy();
  expect(a.over.winner).toBe(b.over.winner);
  expect(a.over.matchId).toBe(b.over.matchId);
  expect(samples).toBeGreaterThan(100);
  expect(mismatches).toBe(0); // same tick, same state on both screens
  expect(p95).toBeLessThan(50); // 95% of ticks reach both clients within one 50 ms network tick
  expect(a.hits).toBeGreaterThan(0);
  expect(a.hits).toBe(b.hits); // every hit that landed on one screen appeared on the other
  expect(a.actions + b.actions).toBeGreaterThan(0); // real gestures from the clips
  if (a.over.winner != null) expect(Object.keys(a.over.elo_delta).length).toBe(2);
  await A.page.waitForSelector('#screen-results.active', { timeout: 10_000 });
  await A.b.close(); await B.b.close();
});
