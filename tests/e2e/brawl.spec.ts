import { test, expect, type Page, type Browser } from '@playwright/test';
import { launchWithClip, openPage, hooks, waitScreen, realErrors, injectCamera, TQ } from './helpers';
import { chromium } from '@playwright/test';
import { GL_ARGS } from '../../playwright.config';

const FIGHTERS = ['shadow_fighterA', 'shadow_fighterB', 'shadow_fighterC', 'shadow_fighterD', 'shadow_fighterE', 'shadow_fighterF', 'shadow_fighterG', 'shadow_fighterH'];
// 8 browsers on this 7 GB test machine: capsule fighters (lowgfx) and no trace recording, or it swaps.
test.use({ trace: 'off', screenshot: 'off' });
const opened: Browser[] = [];
test.afterEach(async () => {
  while (opened.length) await opened.pop()!.close().catch(() => {});
});
async function player(clip: string, path: string, opts = {}) {
  const b = await launchWithClip(clip);
  opened.push(b);
  return { b, ...(await openPage(b, path, opts)) };
}
async function host(clip: string, q: string) {
  const h = await player(clip, `/?${TQ}&skipcal&lowgfx${q}`);
  await waitScreen(h.page, 'menu');
  await h.page.fill('#nickname', 'E2E Brawler 1');
  await h.page.dispatchEvent('#nickname', 'change');
  await h.page.click('[data-action=online-create]');
  await h.page.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 20_000 });
  return { ...h, room: (await hooks(h.page)).online.room as string };
}
async function startBrawl(p: Page) {
  await p.check('input[name=mode][value=brawl]');
  await p.click('#lobby-start');
}
const logOf = (p: Page) => p.evaluate(() => (window as any).__brawl.snapLog.splice(0));

/** Compare all clients' snapshot logs tick by tick (same tick => same positions, HP, knockback, KOs). */
async function syncCheck(pages: Page[], ms: number) {
  let samples = 0, mismatches = 0;
  const lags: number[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await pages[0].waitForTimeout(3000);
    const logs = await Promise.all(pages.map(logOf));
    const ref = new Map(logs[0].map((x: any) => [x.t, x]));
    for (const lg of logs.slice(1))
      for (const x of lg) {
        const y: any = ref.get(x.t);
        if (!y) continue;
        samples++;
        if (JSON.stringify(x.f) !== JSON.stringify(y.f) || x.timer !== y.timer) mismatches++;
        lags.push(Math.abs(x.at - y.at));
      }
    const any = await hooks(pages[0]);
    if (any.matchOver) break;
  }
  lags.sort((a, b) => a - b);
  return { samples, mismatches, p95: Math.round(lags[Math.floor(lags.length * 0.95)] ?? 0) };
}

test('8 browsers, 8 different fighter clips: full 2-minute brawl, all clients agree', async () => {
  test.setTimeout(10 * 60_000);
  const A = await host(FIGHTERS[0], '');
  const others = [];
  for (const clip of FIGHTERS.slice(1)) {
    const p = await player(clip, `/?room=${A.room}&${TQ}&skipcal&lowgfx&renderfps=3`);
    others.push(p);
  }
  for (const o of others) await waitScreen(o.page, 'lobby', 60_000);
  await expect(A.page.locator('#lobby-roster li')).toHaveCount(8);
  await startBrawl(A.page);
  const pages = [A.page, ...others.map((o) => o.page)];
  for (const p of pages) await waitScreen(p, 'game', 60_000);
  const sync = await syncCheck(pages, 3 * 60_000);
  await A.page.waitForFunction(() => (window as any).__brawl.matchOver, null, { timeout: 60_000 });
  const hs = await Promise.all(pages.map(hooks));
  const finalKos = hs.map((h) => JSON.stringify(h.snapshot.f.map((f: any) => [f.id, f.kos])));
  const kos = hs[0].events.filter((e: any) => e.type === 'ko');
  const ringouts = kos.filter((e: any) => e.ringout).length;
  const respawns = hs[0].events.filter((e: any) => e.type === 'respawn').length;
  const actions = hs.map((h) => h.localActions.length);
  const tgChanges = hs.map((h: any) => h.targetChanges);
  const turns = hs.map((h: any) => h.turns);
  const feed = kos.length; // every KO event produces a feed line (lines expire after 6 s)
  console.log('BRAWL8', JSON.stringify({ ...sync, kos: kos.length, ringouts, respawns, actions, tgChanges, turns, feedItems: feed, fps: hs.map((h) => h.poseFps), winner: hs[0].matchOver.winner, finalKos: hs[0].snapshot.f.map((f: any) => [f.name, f.kos]) }));
  expect(sync.samples).toBeGreaterThan(200);
  expect(sync.mismatches).toBe(0);
  expect(new Set(finalKos).size).toBe(1); // final KO counts match on every client
  expect(new Set(hs.map((h) => h.matchOver.winner)).size).toBe(1);
  // With 8 browsers saturating this 8-core test server, client main threads delay socket handling;
  // the 2-browser online test measures p95 49 ms on the same network path. Recorded in TESTING.md.
  expect(sync.p95).toBeLessThan(100);
  for (const P of [A, ...others]) expect(realErrors(P.consoleErrors)).toEqual([]);
});

test('1 human + 7 bots and 3 humans + 5 bots; a fighter disconnects (replaced by a bot); a spectator joins mid-round', async () => {
  test.setTimeout(6 * 60_000);
  // 1 human + 7 bots
  const solo = await host('jab_01', '&bots=8&roundsecs=20');
  await startBrawl(solo.page);
  await solo.page.waitForFunction(() => (window as any).__brawl.snapshot?.f?.length === 8 && (window as any).__brawl.snapshot.phase === 'fight', null, { timeout: 30_000 });
  const s1 = await hooks(solo.page);
  expect(s1.snapshot.f.filter((f: any) => f.bot).length).toBe(7);
  // Ring-outs and respawns (bots knock each other around).
  await solo.page.waitForFunction(() => { const e = (window as any).__brawl.events; return e.some((x: any) => x.type === 'ko' && x.ringout) && e.some((x: any) => x.type === 'respawn'); }, null, { timeout: 60_000 });
  const kofeed = await solo.page.locator('#kofeed div').count();
  console.log('BRAWL_BOTS', JSON.stringify({ kos: (await hooks(solo.page)).events.filter((e: any) => e.type === 'ko').length, kofeed }));
  expect(kofeed).toBeGreaterThan(0);
  // 3 humans + 5 bots
  const A = await host('shadow_fighterA', '&bots=8&roundsecs=40');
  const B = await player('shadow_fighterB', `/?room=${A.room}&${TQ}`);
  const C = await player('jab_01', `/?room=${A.room}&${TQ}`);
  await waitScreen(B.page, 'lobby', 30_000);
  await waitScreen(C.page, 'lobby', 30_000);
  await startBrawl(A.page);
  await A.page.waitForFunction(() => (window as any).__brawl.snapshot?.f?.length === 8 && (window as any).__brawl.snapshot.phase === 'fight', null, { timeout: 30_000 });
  let h = await hooks(A.page);
  expect(h.snapshot.f.filter((f: any) => !f.bot).length).toBe(3);
  // Spectator joins mid-round.
  const S = await player('guard_02', `/?room=${A.room}&${TQ}`);
  await waitScreen(S.page, 'game', 30_000);
  const sh = await hooks(S.page);
  expect(sh.snapshot.f.length).toBe(8);
  expect(sh.snapshot.f.some((f: any) => f.id === sh.online.slot)).toBeFalsy();
  // A fighter disconnects: after the grace period their fighter becomes a bot; the round keeps going.
  const cSlot = (await hooks(C.page)).online.slot;
  await C.b.close();
  await A.page.waitForFunction((s) => { const f = (window as any).__brawl.snapshot.f.find((x: any) => x.id === s); return f && f.bot === 1; }, cSlot, { timeout: 25_000 });
  h = await hooks(A.page);
  expect(h.snapshot.f.length).toBe(8);
  expect(h.matchOver).toBeFalsy();
});

test('8-fighter brawl on a phone-sized viewport: record FPS (real VRM fighters and capsules)', async () => {
  test.setTimeout(3 * 60_000);
  const results: Record<string, unknown> = {};
  for (const gfx of ['vrm', 'lowgfx']) {
    const b = await chromium.launch({ args: GL_ARGS });
    opened.push(b);
    const q = gfx === 'lowgfx' ? `${TQ}` : 'cpu&nocomment&notut';
    const { page } = await openPage(b, `/?mode=brawl&bots=7&skipcal&${q}`, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, (ctx) => injectCamera(ctx, 'jab_01'));
    await waitScreen(page, 'game', 90_000);
    await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 60_000 });
    await page.waitForTimeout(8000);
    const fps: number[] = [];
    for (let i = 0; i < 5; i++) {
      fps.push((await hooks(page)).renderFps);
      await page.waitForTimeout(1000);
    }
    results[gfx] = { renderFps: fps, fighters: (await hooks(page)).snapshot.f.length };
    await b.close();
  }
  console.log('BRAWL_PHONE_FPS (SwiftShader CPU rendering on the test server, not a phone GPU)', JSON.stringify(results));
});
