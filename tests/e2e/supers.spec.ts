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

test('supers fire only with a full meter (X clip, empty meter => no shield super)', async () => {
  test.setTimeout(90_000);
  const { b, page } = await practice('xshield_01', 'meter=0&botlevel=-1');
  await page.waitForTimeout(20_000);
  const h = await hooks(page);
  const me = h.snapshot.f.find((f: any) => !f.bot).id;
  const xs = h.localActions.filter((a: any) => a.kind === 'xshield').length;
  console.log('SUPER_GATE', JSON.stringify({ xGestures: xs, shields: supersBy(h, me, 'shield').length, meter: h.snapshot.f.find((f: any) => f.id === me).meter }));
  expect(xs).toBeGreaterThan(0); // the X gesture was recognized
  expect(supersBy(h, me).length).toBe(0); // but no super without a full meter
  await b.close();
});

test('shield super with a full meter blocks all damage for 3 s; cooldown respected', async () => {
  test.setTimeout(120_000);
  const { b, page } = await practice('xshield_01', 'meter=100&botlevel=3&infmeter');
  await page.waitForTimeout(35_000);
  const h = await hooks(page);
  const me = h.snapshot.f.find((f: any) => !f.bot).id;
  const shields = supersBy(h, me, 'shield');
  // Cooldown: shield supers at least 10 s apart (TUNING.superCooldown.shield).
  const gaps = shields.slice(1).map((s: any, i: number) => (s.t - shields[i].t) / 1000);
  // Hits on me within 3 s after each shield must be shielded with 0 damage.
  const hitsOnMe = h.events.filter((e: any) => e.type === 'hit' && e.target === me);
  const duringShield = hitsOnMe.filter((e: any) => shields.some((s: any) => e.t > s.t && e.t < s.t + 2800));
  console.log('SHIELD', JSON.stringify({ shields: shields.length, gaps, hitsOnMe: hitsOnMe.length, duringShield: duringShield.map((e: any) => [e.damage, e.shielded]) }));
  expect(shields.length).toBeGreaterThan(0);
  for (const g of gaps) expect(g).toBeGreaterThanOrEqual(9.5);
  for (const e of duringShield) {
    expect(e.shielded).toBe(true);
    expect(e.damage).toBe(0);
  }
  await b.close();
});

test('energy blast travels as a projectile and can be blocked', async () => {
  test.setTimeout(120_000);
  // The bot starts with a full meter and fires supers; the player holds a block (block_01 frozen at 3.6 s, mid-block).
  const b = await chromium.launch({ args: GL_ARGS });
  const { page } = await openPage(b, `/?mode=practice&skipcal&${TQ}&meter=100&botlevel=2`, {}, (ctx) => injectCamera(ctx, 'block_01'));
  await waitScreen(page, 'game');
  await page.evaluate(() => (window as any).__cam.freeze(3.6));
  await page.waitForFunction(() => (window as any).__brawl.lastGesture?.[0]?.blocking === true, null, { timeout: 30_000 });
  const positions: number[][] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    const p = await page.evaluate(() => (window as any).__brawl.snapshot?.p ?? []);
    if (p.length) positions.push([p[0].x, p[0].z]);
    const h = await hooks(page);
    if (h.events.some((e: any) => e.type === 'hit' && e.kind === 'blast') && positions.length > 2) break;
    await page.waitForTimeout(50);
  }
  const h = await hooks(page);
  const blasts = h.events.filter((e: any) => e.type === 'hit' && e.kind === 'blast');
  console.log('BLAST', JSON.stringify({ samples: positions.slice(0, 6), blasts: blasts.map((e: any) => [e.damage, e.blocked]) }));
  expect(positions.length).toBeGreaterThan(1);
  const moved = Math.hypot(positions[positions.length - 1][0] - positions[0][0], positions[positions.length - 1][1] - positions[0][1]);
  expect(moved).toBeGreaterThan(0.2);
  expect(blasts.length).toBeGreaterThan(0);
  // Blocked blasts deal 20% (4 HP), unblocked deal 20.
  for (const e of blasts) expect(e.damage).toBe(e.blocked ? 4 : 20);
  expect(blasts.some((e: any) => e.blocked)).toBe(true);
  await b.close();
});
