import { test, expect, type Page, type Browser } from '@playwright/test';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { launchWithClip, openPage, hooks, waitScreen, realErrors, BASE_URL, TQ } from './helpers';

const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';
const opened: Browser[] = [];
test.afterEach(async () => {
  while (opened.length) await opened.pop()!.close().catch(() => {});
});

async function player(clip: string, path: string, opts: Parameters<Browser['newContext']>[0] = {}) {
  const b = await launchWithClip(clip);
  opened.push(b);
  const r = await openPage(b, path, opts);
  return { b, ...r };
}
async function hostRoom(clip: string, q = '', opts = {}) {
  const h = await player(clip, `/?${TQ}${q}`, opts);
  await waitScreen(h.page, 'menu');
  await h.page.click('[data-action=online-create]');
  await h.page.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 20_000 });
  const room = (await hooks(h.page)).online.room as string;
  return { ...h, room };
}
const rosterCount = (p: Page) => p.locator('#lobby-roster li').count();
function rawClient(room: string, nick: string): Promise<{ ws: WebSocket; msgs: any[] }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const msgs: any[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', room, clientId: randomUUID(), nickname: nick }));
      setTimeout(() => resolve({ ws, msgs }), 400);
    });
  });
}

test('join by code (typed), and an invalid code shows a clear error', async () => {
  const A = await hostRoom('shadow_fighterA');
  const B = await player('shadow_fighterB', `/?${TQ}`);
  await waitScreen(B.page, 'menu');
  await B.page.click('[data-action=online-join]');
  await B.page.fill('#join-code', 'QQQQ');
  await B.page.click('#join-go');
  await expect(B.page.locator('#join-error')).toContainText('No room with that code');
  await B.page.fill('#join-code', A.room.toLowerCase());
  await B.page.click('#join-go');
  await waitScreen(B.page, 'lobby', 15_000);
  await expect(A.page.locator('#lobby-roster li')).toHaveCount(2);
  expect(await B.page.textContent('#lobby-code')).toBe(A.room);
});

test('third person becomes a spectator and sees the live fight; ninth is refused', async () => {
  test.setTimeout(180_000);
  const A = await hostRoom('shadow_fighterA', '&roundsecs=30');
  const B = await player('shadow_fighterB', `/?room=${A.room}&${TQ}`);
  await waitScreen(B.page, 'lobby', 30_000);
  const C = await player('jab_01', `/?room=${A.room}&${TQ}`);
  await waitScreen(C.page, 'lobby', 30_000);
  await A.page.click('#lobby-start');
  for (const p of [A.page, B.page, C.page]) await waitScreen(p, 'game', 30_000);
  await C.page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 20_000 });
  const ch = await hooks(C.page);
  expect(ch.mode).toBe('online-duel');
  expect(ch.snapshot.f.length).toBe(2); // C is not a fighter
  const t1 = ch.snapshot.t;
  await C.page.waitForTimeout(2000);
  expect((await hooks(C.page)).snapshot.t).toBeGreaterThan(t1 + 1); // live updates
  // Spectator cheers appear on a fighter's screen.
  await C.page.click('#cheer-bar [data-cheer="🔥"]');
  await A.page.waitForFunction(() => (window as any).__brawl.cheers > 0, null, { timeout: 5000 });
  // Fill the room to 8 with lightweight clients, then a ninth browser is refused.
  const extras = [];
  for (let i = 0; i < 5; i++) extras.push(await rawClient(A.room, `E2E Extra ${i}`));
  const roster = extras[4].msgs.filter((m) => m.type === 'roster').pop();
  expect(roster.players.length).toBe(8);
  const N = await player('jab_01', `/?${TQ}`);
  await waitScreen(N.page, 'menu');
  await N.page.click('[data-action=online-join]');
  await N.page.fill('#join-code', A.room);
  await N.page.click('#join-go');
  await expect(N.page.locator('#join-error')).toContainText('full');
  extras.forEach((e) => e.ws.close());
});

test('guest disconnects mid-round: the remaining fighter wins after the 10 s grace period', async () => {
  test.setTimeout(120_000);
  const A = await hostRoom('shadow_fighterA');
  const B = await player('shadow_fighterB', `/?room=${A.room}&${TQ}`);
  await waitScreen(B.page, 'lobby', 30_000);
  await A.page.click('#lobby-start');
  await A.page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 30_000 });
  await B.b.close();
  // Within the grace period the guest's fighter idles (not present).
  await A.page.waitForFunction(() => (window as any).__brawl.snapshot.f.some((f: any) => f.pr === 0), null, { timeout: 10_000 });
  await A.page.waitForFunction(() => (window as any).__brawl.matchOver, null, { timeout: 20_000 });
  const h = await hooks(A.page);
  expect(h.matchOver.winner).toBe(h.online.slot);
  expect(realErrors(A.consoleErrors)).toEqual([]);
});

test('host disconnects mid-round: guest wins and becomes host', async () => {
  test.setTimeout(120_000);
  const A = await hostRoom('shadow_fighterA');
  const B = await player('shadow_fighterB', `/?room=${A.room}&${TQ}`);
  await waitScreen(B.page, 'lobby', 30_000);
  await A.page.click('#lobby-start');
  await B.page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 30_000 });
  await A.b.close();
  await B.page.waitForFunction(() => (window as any).__brawl.matchOver, null, { timeout: 25_000 });
  const h = await hooks(B.page);
  expect(h.matchOver.winner).toBe(h.online.slot);
  // B is now host: the rematch button is enabled on the results screen.
  await B.page.waitForSelector('#screen-results.active', { timeout: 10_000 });
  await expect(B.page.locator('#res-rematch')).toBeEnabled();
});

test('network drop: reconnect within 10 s resumes the same fighter', async () => {
  test.setTimeout(120_000);
  const A = await hostRoom('shadow_fighterA');
  const B = await player('shadow_fighterB', `/?room=${A.room}&${TQ}`);
  await waitScreen(B.page, 'lobby', 30_000);
  await A.page.click('#lobby-start');
  await B.page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 30_000 });
  const slotBefore = (await hooks(B.page)).online.slot;
  await B.ctx.setOffline(true);
  await B.page.waitForTimeout(4000);
  await B.ctx.setOffline(false);
  await B.page.waitForFunction((s) => (window as any).__brawl.online?.slot === s && (window as any).__brawl.snapshot?.f.find((f: any) => f.id === s)?.pr === 1, slotBefore, { timeout: 15_000 });
  const ha = await hooks(A.page);
  expect(ha.matchOver).toBeFalsy(); // match continued
  expect(ha.snapshot.f.length).toBe(2);
});

test('200 ms added latency on one client: match still plays and both agree', async () => {
  test.setTimeout(8 * 60_000);
  const A = await hostRoom('shadow_fighterA', '&roundsecs=25');
  const B = await player('jab_01', `/?room=${A.room}&${TQ}&netlag=200`);
  await waitScreen(B.page, 'lobby', 30_000);
  await A.page.click('#lobby-start');
  await A.page.waitForFunction(() => (window as any).__brawl.matchOver, null, { timeout: 7 * 60_000, polling: 1000 });
  await B.page.waitForFunction(() => (window as any).__brawl.matchOver, null, { timeout: 10_000 });
  const [ha, hb] = [await hooks(A.page), await hooks(B.page)];
  console.log('LAG200', JSON.stringify({ winner: ha.matchOver.winner, bActions: hb.localActions.length, hits: ha.events.filter((e: any) => e.type === 'hit').length }));
  expect(ha.matchOver.winner).toBe(hb.matchOver.winner);
  expect(hb.localActions.length).toBeGreaterThan(0);
});

for (const [name, vpA, vpB] of [
  ['both players on phones', { width: 844, height: 390 }, { width: 844, height: 390 }],
  ['one desktop, one phone', { width: 1280, height: 720 }, { width: 390, height: 844 }],
] as const) {
  test(`${name}: room plays through the first round`, async () => {
    test.setTimeout(180_000);
    const mob = (vp: { width: number; height: number }) => (vp.width < 900 ? { viewport: vp, isMobile: true, hasTouch: true } : { viewport: vp });
    const A = await hostRoom('shadow_fighterA', '&roundsecs=15', mob(vpA));
    const B = await player('jab_01', `/?room=${A.room}&${TQ}`, mob(vpB));
    await waitScreen(B.page, 'lobby', 30_000);
    await A.page.click('#lobby-start');
    await B.page.waitForFunction(() => (window as any).__brawl.events.some((e: any) => e.type === 'round_end'), null, { timeout: 90_000 });
    for (const P of [A, B]) {
      const overflow = await P.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(realErrors(P.consoleErrors)).toEqual([]);
    }
  });
}
