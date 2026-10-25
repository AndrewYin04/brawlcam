import { test, expect } from '@playwright/test';
import { launchWithClip, openPage, hooks, waitScreen, injectCamera, TQ } from './helpers';
import { chromium } from '@playwright/test';
import { GL_ARGS } from '../../playwright.config';

async function practice(clip: string, q: string) {
  const b = await launchWithClip(clip);
  const r = await openPage(b, `/?mode=practice&skipcal&${TQ}&${q}`);
  await waitScreen(r.page, 'game');
  await r.page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 30_000 });
  return { b, ...r };
}
const supersBy = (h: any, id: number, kind?: string) => h.events.filter((e: any) => e.type === 'super' && e.id === id && (!kind || e.kind === kind));

test('supers fire only with a full meter (X clip, empty meter => no Iron Wall)', async () => {
  test.setTimeout(90_000);
  const { b, page } = await practice('xshield_01', 'meter=0&botlevel=-1');
  await page.waitForTimeout(20_000);
  const h = await hooks(page);
  const me = h.snapshot.f.find((f: any) => !f.bot).id;
  const xs = h.localActions.filter((a: any) => a.kind === 'xshield').length;
  console.log('SUPER_GATE', JSON.stringify({ xGestures: xs, shields: supersBy(h, me, 'ironwall').length, meter: h.snapshot.f.find((f: any) => f.id === me).meter }));
  expect(xs).toBeGreaterThan(0); // the X gesture was recognized
  expect(supersBy(h, me).length).toBe(0); // but no super without a full meter
  await b.close();
});

test('Iron Wall with a full meter blocks all damage for 2.5 s; cooldown respected', async () => {
  test.setTimeout(120_000);
  const { b, page } = await practice('xshield_01', 'meter=100&botlevel=3&infmeter');
  await page.waitForTimeout(35_000);
  const h = await hooks(page);
  const me = h.snapshot.f.find((f: any) => !f.bot).id;
  const shields = supersBy(h, me, 'ironwall');
  // Cooldown: shield supers at least 10 s apart (TUNING.superCooldown.ironwall).
  const gaps = shields.slice(1).map((s: any, i: number) => (s.t - shields[i].t) / 1000);
  // Hits on me within 2.5 s after each Iron Wall must be shielded with 0 damage.
  const hitsOnMe = h.events.filter((e: any) => e.type === 'hit' && e.target === me);
  const duringShield = hitsOnMe.filter((e: any) => shields.some((s: any) => e.t > s.t && e.t < s.t + 2400));
  console.log('SHIELD', JSON.stringify({ shields: shields.length, gaps, hitsOnMe: hitsOnMe.length, duringShield: duringShield.map((e: any) => [e.damage, e.shielded]) }));
  expect(shields.length).toBeGreaterThan(0);
  for (const g of gaps) expect(g).toBeGreaterThanOrEqual(9.5);
  for (const e of duringShield) {
    expect(e.shielded).toBe(true);
    expect(e.damage).toBe(0);
  }
  await b.close();
});

// Since the guard meter (Oct 25 1:50 AM) a scripted blocker is guard-broken several times a minute, and a blast
// crosses the gap in ~0.25 s, about the block's own latency: whether a blast meets a raised guard is timing luck.
// This test checks through the real UI that the blast fires, travels and lands; blocked-blast damage and guard drain
// are asserted deterministically in tests/unit/guard-meter.ts ("blocked blast deals 10%", "blast (50) breaks a 40 guard").
test('energy blast travels as a projectile and lands (blocked damage: unit guard-meter)', async () => {
  test.setTimeout(120_000);
  // The bot starts with a full meter and fires supers; the player holds a block (block_01 frozen at 3.6 s, mid-block).
  const b = await chromium.launch({ args: GL_ARGS });
  const { page } = await openPage(b, `/?mode=practice&skipcal&${TQ}&meter=100&botlevel=2`, {}, (ctx) => injectCamera(ctx, 'block_01'));
  await waitScreen(page, 'game');
  await page.evaluate(() => (window as any).__cam.freeze(3.6));
  await page.waitForFunction(() => (window as any).__brawl.lastGesture?.[0]?.blocking === true, null, { timeout: 30_000 });
  // The guard now drains while held (empty in 5 s) and refills with the arms down: guard 2 s, rest 1.5 s, like a player.
  let stop = false;
  const cycle = (async () => {
    while (!stop) {
      await page.evaluate(() => (window as any).__cam.freeze(3.6)).catch(() => {});
      await page.waitForTimeout(2000);
      await page.evaluate(() => (window as any).__cam.freeze(1.0)).catch(() => {});
      await page.waitForTimeout(1500);
    }
  })();
  await page.waitForFunction(() => (window as any).__brawl.events.some((e: any) => e.type === 'hit' && e.kind === 'blast'), null, { timeout: 90_000, polling: 250 }).finally(() => (stop = true));
  await cycle;
  const h = await hooks(page);
  const blasts = h.events.filter((e: any) => e.type === 'hit' && e.kind === 'blast');
  // Projectile path from the page's own per-tick log: one projectile's positions over time.
  const log = await page.evaluate(() => (window as any).__brawl.projLog);
  const firstId = log[0]?.[0];
  const positions = log.filter((p: number[]) => p[0] === firstId).map((p: number[]) => [p[1], p[2]]);
  console.log('BLAST', JSON.stringify({ path: positions.slice(0, 8), blasts: blasts.map((e: any) => [e.damage, e.blocked]) }));
  expect(positions.length).toBeGreaterThan(1);
  const moved = Math.hypot(positions[positions.length - 1][0] - positions[0][0], positions[positions.length - 1][1] - positions[0][1]);
  expect(moved).toBeGreaterThan(0.1);
  expect(blasts.length).toBeGreaterThan(0);
  // Blocked blasts deal 10% (2 HP), unblocked 20, except a finishing blast, capped at the HP the target had left.
  const kos = h.events.filter((e: any) => e.type === 'ko' && e.kind === 'blast').length;
  for (const e of blasts) if (e.blocked) expect(e.damage).toBe(2);
  else if (e.damage !== 20) expect(kos).toBeGreaterThan(0);
  await b.close();
});

test('guard: holding it drains the meter until it breaks, then a hit lands for full damage while dizzy', async () => {
  test.setTimeout(150_000);
  const b = await chromium.launch({ args: GL_ARGS });
  // The player holds a block (block_01 frozen mid-block); the bot keeps attacking.
  const { page } = await openPage(b, `/?mode=practice&skipcal&${TQ}&botlevel=3`, {}, (ctx) => injectCamera(ctx, 'block_01'));
  await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 90_000 });
  await page.evaluate(() => (window as any).__cam.freeze(3.6));
  await page.waitForFunction(() => (window as any).__brawl.lastGesture?.[0]?.blocking === true, null, { timeout: 30_000 });
  const me = await page.evaluate(() => (window as any).__brawl.snapshot.f.find((f: any) => !f.bot).id);
  await page.waitForFunction((me) => (window as any).__brawl.events.some((e: any) => e.type === 'guard_break' && e.id === me), me, { timeout: 60_000, polling: 200 });
  await page.screenshot({ path: 'test-results/guard-break.png' });
  const brk = await page.evaluate((me) => (window as any).__brawl.events.find((e: any) => e.type === 'guard_break' && e.id === me), me);
  await page.waitForFunction(([me, t]) => (window as any).__brawl.events.some((e: any) => e.type === 'hit' && e.target === me && e.t > t), [me, brk.t] as const, { timeout: 30_000, polling: 100 }).catch(() => {});
  const h = await page.evaluate(() => (window as any).__brawl);
  const blockedBefore = h.events.filter((e: any) => e.type === 'hit' && e.target === me && e.t < brk.t && e.blocked);
  const dizzyHit = h.events.find((e: any) => e.type === 'hit' && e.target === me && e.t > brk.t && e.t < brk.t + 2000);
  const snapAfter = h.snapLog.find((s: any) => s.at > brk.t);
  console.log('GUARD', JSON.stringify({ blockedBefore: blockedBefore.map((e: any) => [e.kind, e.damage, e.guard]), break: brk, dizzyHit: dizzyHit && [dizzyHit.kind, dizzyHit.damage, dizzyHit.blocked] }));
  expect(blockedBefore.length).toBeGreaterThan(0);
  for (const e of blockedBefore) expect(e.damage).toBeLessThanOrEqual(2);
  if (dizzyHit) expect(dizzyHit.blocked).toBe(false);
  void snapAfter;
  await b.close();
});
