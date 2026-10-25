import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { launchWithClip, openPage, hooks, waitScreen, realErrors, fixture, FIXTURES, BASE_URL, TQ } from './helpers';

// Fighter Forge, commentator, rivalry card, leaderboard, store, and motion data.
// AI responses come from recorded fixtures (spec 10: automated tests use recorded Meta responses);
// tagged @live tests make real calls and count against the 20-call budget.

async function routeForge(ctx: BrowserContext, text: any, opts: { delayMs?: number; status?: number; image?: boolean } = {}) {
  await ctx.route('**/api/forge', async (r) => {
    if (opts.delayMs) await new Promise((res) => setTimeout(res, opts.delayMs));
    await r.fulfill({ status: opts.status ?? 200, contentType: 'application/json', body: JSON.stringify(text) }).catch(() => {});
  });
  await ctx.route('**/api/forge/image', (r) => r.fulfill({ status: opts.image === false ? 503 : 200, contentType: 'application/json', body: JSON.stringify(opts.image === false ? { error: 'x' } : { image: '/api/forge/image/fixturecard' }) }));
  await ctx.route('**/api/forge/image/fixturecard', (r) => r.fulfill({ path: path.join(FIXTURES, 'forge-card.jpg'), contentType: 'image/jpeg' }));
}

async function forgePage(setup: (ctx: BrowserContext) => Promise<void>) {
  const b = await launchWithClip('jab_01');
  const r = await openPage(b, `/?${TQ}`, {}, setup);
  await waitScreen(r.page, 'menu');
  await r.page.click('[data-action=forge]');
  return { b, ...r };
}
const forgeDone = (p: Page, timeout = 30_000) => p.waitForFunction(() => (window as any).__brawl.forge?.state === 'done', null, { timeout });

test('Forge: valid prompt => name, story, moves, card art; card colors tint the fighter in game', async () => {
  const { b, page, consoleErrors } = await forgePage((ctx) => routeForge(ctx, fixture('api-forge-ok.json')));
  await page.fill('#forge-prompt', 'lava golem with a crown');
  await page.click('#forge-go');
  await forgeDone(page);
  const f = (await hooks(page)).forge;
  expect(f.source).toBe('meta');
  expect(f.image).toBe(true);
  await expect(page.locator('#forge-result h3')).toHaveText('King Magma');
  await expect(page.locator('#forge-result img')).toBeVisible();
  const color = await page.evaluate(() => localStorage.getItem('throwhands.color'));
  expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  // Fight as the forged fighter: my fighter in the match uses the card color.
  await page.click('#forge-result button.btn.primary');
  await page.waitForSelector('#calib:not(.hidden)', { timeout: 30_000 });
  await page.click('#calib-skip');
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 20_000 });
  const me = (await hooks(page)).snapshot.f.find((x: any) => !x.bot);
  expect(me.color.toLowerCase()).toBe(color!.toLowerCase());
  expect(me.name).toBe('King Magma');
  expect(realErrors(consoleErrors)).toEqual([]);
  await b.close();
});

test('Forge: empty prompt => friendly message and a house fighter (real server, no AI call)', async () => {
  const { b, page } = await forgePage(async () => {});
  await page.fill('#forge-prompt', '');
  await page.click('#forge-go');
  await forgeDone(page);
  expect((await hooks(page)).forge.source).toBe('fallback');
  await expect(page.locator('#toast')).toContainText('Type an idea');
  await b.close();
});

test('Forge: offensive prompt => model refusal shown politely, house fighter', async () => {
  const { b, page } = await forgePage((ctx) => routeForge(ctx, fixture('api-forge-refused.json')));
  await page.fill('#forge-prompt', 'something hateful');
  await page.click('#forge-go');
  await forgeDone(page);
  const f = (await hooks(page)).forge;
  expect(f.refused).toBe(true);
  await expect(page.locator('#toast')).toContainText('different fighter');
  await expect(page.locator('#forge-result h3')).toBeVisible();
  await b.close();
});

test('Forge: Meta API erroring => default fighter and the game still works', async () => {
  const { b, page } = await forgePage((ctx) => routeForge(ctx, { error: 'boom' }, { status: 500 }));
  await page.fill('#forge-prompt', 'storm owl');
  await page.click('#forge-go');
  await forgeDone(page);
  expect((await hooks(page)).forge.source).toBe('fallback');
  await page.click('#forge-result button.btn.primary');
  await page.waitForSelector('#calib:not(.hidden)', { timeout: 30_000 });
  await page.click('#calib-skip');
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 20_000 });
  await b.close();
});

test('Forge: generation longer than 15 s => spinner, then timeout fallback', async () => {
  const { b, page } = await forgePage((ctx) => routeForge(ctx, fixture('api-forge-ok.json'), { delayMs: 25_000 }));
  await page.fill('#forge-prompt', 'slow golem');
  const t0 = Date.now();
  await page.click('#forge-go');
  await expect(page.locator('#forge-status')).toContainText('Forging');
  await forgeDone(page, 30_000);
  const secs = (Date.now() - t0) / 1000;
  expect(secs).toBeLessThan(17);
  expect((await hooks(page)).forge.source).toBe('fallback');
  await b.close();
});

test('@live Forge: real Muse Spark + Muse Image through the deployed server (2 Meta calls)', async () => {
  test.skip(!process.env.LIVE_AI, 'set LIVE_AI=1 for live AI smoke tests');
  const { b, page } = await forgePage(async () => {});
  await page.fill('#forge-prompt', `neon kangaroo boxer ${Date.now() % 1000}`);
  await page.click('#forge-go');
  await forgeDone(page, 30_000);
  const f = (await hooks(page)).forge;
  console.log('LIVE_FORGE', JSON.stringify(f));
  expect(f.source).toBe('meta');
  expect(f.ms).toBeLessThan(15_500);
  await b.close();
});

// ---------------- Commentator ----------------

async function commentaryMatch(handler: (route: any) => Promise<void> | void) {
  const b = await launchWithClip('jab_01');
  const r = await openPage(b, `/?mode=practice&skipcal&cpu&lowgfx&botlevel=1`, {}, async (ctx) => { await ctx.route('**/api/commentary', handler); });
  await waitScreen(r.page, 'game');
  await r.page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 30_000 });
  return { b, ...r };
}

test('Commentator: lines arrive during play; mute and unmute', async () => {
  test.setTimeout(90_000);
  let calls = 0;
  const { b, page } = await commentaryMatch((r) => {
    calls++;
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture('api-commentary.json')) });
  });
  await page.waitForFunction(() => (window as any).__brawl.commentary.length >= 2, null, { timeout: 40_000 });
  let log = await page.evaluate(() => (window as any).__brawl.commentary.slice());
  expect(log[0].text).toContain('King Magma');
  const gaps = log.slice(1).map((l: any, i: number) => (l.at - log[i].at) / 1000);
  for (const g of gaps) expect(g).toBeGreaterThanOrEqual(3.4); // one line every 3-4 s at most
  await expect(page.locator('#commentary')).toContainText('King Magma');
  await page.click('#btn-mute');
  await expect(page.locator('#btn-mute')).toHaveText('🔇');
  const n = log.length;
  await page.waitForFunction((n) => (window as any).__brawl.commentary.length > n, n, { timeout: 20_000 });
  log = await page.evaluate(() => (window as any).__brawl.commentary.slice());
  expect(log[log.length - 1].spoken).toBe('muted');
  await page.click('#btn-mute');
  await expect(page.locator('#btn-mute')).toHaveText('🔊');
  expect(await page.evaluate(() => localStorage.getItem('throwhands.mute'))).toBe('0');
  expect(calls).toBeGreaterThanOrEqual(2);
  await b.close();
});

test('Commentator: Gemini rate-limited or down => silent fallback, no errors shown', async () => {
  test.setTimeout(60_000);
  const { b, page, consoleErrors } = await commentaryMatch((r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"slow down"}' }));
  await page.waitForTimeout(15_000);
  const h = await hooks(page);
  expect(h.snapshot.phase === 'fight' || h.snapshot.phase === 'round_end' || h.snapshot.phase === 'countdown').toBeTruthy();
  expect(await page.locator('#toast.show').count()).toBe(0);
  expect(h.errors).toEqual([]);
  expect(realErrors(consoleErrors).filter((e) => !e.includes('429'))).toEqual([]);
  await b.close();
});

// ---------------- Leaderboard ----------------

test('Leaderboard: loads from Tiger Data; friendly error when unreachable; empty state', async () => {
  const b = await launchWithClip('jab_01');
  const { page } = await openPage(b, `/?${TQ}`);
  await waitScreen(page, 'menu');
  await page.click('[data-action=leaderboard]');
  await expect(page.locator('#lb table.lb, #lb-empty')).toBeVisible({ timeout: 15_000 });
  // API (real): includes players with Elo written by online matches.
  const api = await page.request.get(BASE_URL + '/api/leaderboard');
  expect(api.status()).toBe(200);
  const j = await api.json();
  expect(Array.isArray(j.players)).toBe(true);
  // Unreachable database (simulated at the API): friendly error, game still works.
  await page.route('**/api/leaderboard', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"db_unavailable"}' }));
  await page.click('#screen-page [data-action=menu]');
  await page.click('[data-action=leaderboard]');
  await expect(page.locator('#lb-error')).toContainText('taking a breather');
  // Empty database.
  await page.unroute('**/api/leaderboard');
  await page.route('**/api/leaderboard', (r) => r.fulfill({ contentType: 'application/json', body: '{"players":[]}' }));
  await page.click('#screen-page [data-action=menu]');
  await page.click('[data-action=leaderboard]');
  await expect(page.locator('#lb-empty')).toBeVisible();
  await page.click('#screen-page [data-action=menu]');
  await page.click('[data-action=practice]');
  await page.waitForSelector('#calib:not(.hidden)', { timeout: 30_000 });
  await b.close();
});

// ---------------- Store ----------------

test('Store: browse, mock purchase marks owned, equip shows in game, opt-in toggle persists', async () => {
  const b = await launchWithClip('jab_01');
  const { page } = await openPage(b, `/?${TQ}`);
  await waitScreen(page, 'menu');
  await page.click('[data-action=store]');
  await expect(page.locator('#skins .card')).toHaveCount(8);
  await expect(page.locator('text=Demo: no charge').first()).toBeVisible();
  const gold = page.locator('#skins .card[data-skin=gold] button');
  await expect(gold).toContainText('Buy');
  await gold.click();
  await expect(page.locator('#skins .card[data-skin=gold] button')).toHaveText('Equip');
  await page.locator('#skins .card[data-skin=gold] button').click();
  await expect(page.locator('#skins .card[data-skin=gold] button')).toHaveText('Equipped');
  // Motion data opt-in: off by default, explicit checkbox, persists.
  await page.click('#motion-settings');
  await expect(page.locator('#consent-box')).not.toBeChecked();
  await page.check('#consent-box');
  await page.click('#consent-save');
  await page.reload();
  await waitScreen(page, 'menu');
  expect(await page.evaluate(() => localStorage.getItem('throwhands.motionConsent'))).toBe('yes');
  // Equipped skin in game.
  await page.goto(BASE_URL + `/?mode=practice&skipcal&${TQ}`);
  await waitScreen(page, 'game');
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 30_000 });
  const me = (await hooks(page)).snapshot.f.find((x: any) => !x.bot);
  expect(me.color.toLowerCase()).toBe('#ffc53d');
  await b.close();
});

// ---------------- Motion data ----------------

test('Motion data: opted-in match writes labeled samples (counts update); opted-out writes none; export JSON', async () => {
  test.setTimeout(150_000);
  const before = await (await (await import('@playwright/test')).request.newContext()).get(BASE_URL + '/api/motion/stats').then((r) => r.json());
  const total = (s: any) => (s.labels ?? []).reduce((a: number, l: any) => a + l.samples, 0);
  // Opted out: no requests at all.
  const b = await launchWithClip('jab_01');
  const out = await openPage(b, `/?mode=practice&skipcal&${TQ}&botlevel=-1`);
  let posted = 0;
  await out.page.route('**/api/pose-samples', (r) => {
    posted++;
    return r.continue();
  });
  await waitScreen(out.page, 'game');
  await out.page.waitForFunction(() => (window as any).__brawl.localActions.length >= 4, null, { timeout: 40_000 });
  await out.page.waitForTimeout(7000);
  expect(posted).toBe(0);
  await out.ctx.close();
  // Opted in.
  const inn = await openPage(b, `/?${TQ}`);
  await inn.page.evaluate(() => localStorage.setItem('throwhands.motionConsent', 'yes'));
  await inn.page.goto(BASE_URL + `/?mode=practice&skipcal&${TQ}&botlevel=-1`);
  await waitScreen(inn.page, 'game');
  await inn.page.waitForFunction(() => (window as any).__brawl.motion?.sent > 0, null, { timeout: 60_000 });
  const sent = await inn.page.evaluate(() => (window as any).__brawl.motion.sent);
  await inn.page.waitForTimeout(2000);
  const after = await inn.page.request.get(BASE_URL + '/api/motion/stats').then((r) => r.json());
  console.log('MOTION', JSON.stringify({ sent, before: total(before), after: total(after), labels: after.labels }));
  expect(total(after)).toBeGreaterThan(total(before));
  // Dashboard + export.
  await inn.page.goto(BASE_URL + `/?${TQ}`);
  await waitScreen(inn.page, 'menu');
  await inn.page.click('[data-action=motion]');
  await expect(inn.page.locator('#mtable')).toBeVisible({ timeout: 15_000 });
  const [dl] = await Promise.all([inn.page.waitForEvent('download'), inn.page.click('#mexport')]);
  const file = await dl.path();
  const json = JSON.parse(fs.readFileSync(file!, 'utf8'));
  expect(json.sequences.length).toBeGreaterThan(0);
  expect(json.sequences[0].frames[0].length).toBe(33);
  expect(JSON.stringify(json)).not.toMatch(/nickname|player|clientId/i);
  await b.close();
});
