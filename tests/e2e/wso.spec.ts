import { test, expect, type Page, type Browser } from '@playwright/test';
import { launchWithClip, openPage, hooks, waitScreen, realErrors, TQ } from './helpers';

const FIGHTERS = ['shadow_fighterA', 'shadow_fighterB', 'shadow_fighterC', 'shadow_fighterD', 'shadow_fighterE', 'shadow_fighterF', 'shadow_fighterG', 'jab_01'];
// 8 browsers on this 7 GB test machine: capsule fighters (lowgfx) and no trace recording, or it swaps.
test.use({ trace: 'off', screenshot: 'off' });
const opened: Browser[] = [];
test.afterEach(async () => {
  while (opened.length) await opened.pop()!.close().catch(() => {});
});
async function player(clip: string, path: string) {
  const b = await launchWithClip(clip);
  opened.push(b);
  return { b, ...(await openPage(b, path)) };
}
const roster = (p: Page) => p.evaluate(() => {
  const items = [...document.querySelectorAll('#lobby-roster li')].map((li) => li.textContent);
  return items;
});

test('winner stays on: 8 browsers, rotates through 4+ matches, spectators cheer, queue survives reconnect, fighter leaves mid-match', async () => {
  test.setTimeout(14 * 60_000);
  const A = await player(FIGHTERS[0], `/?${TQ}&skipcal&lowgfx&roundsecs=10`);
  await waitScreen(A.page, 'menu');
  await A.page.click('[data-action=online-create]');
  await A.page.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 20_000 });
  const room = (await hooks(A.page)).online.room;
  const others = [];
  for (const clip of FIGHTERS.slice(1)) others.push(await player(clip, `/?room=${room}&${TQ}&skipcal&lowgfx&renderfps=8`));
  for (const o of others) await waitScreen(o.page, 'lobby', 60_000);
  const all = [A, ...others];
  await A.page.check('input[name=mode][value=wso]');
  await A.page.click('#lobby-start');
  const matchIds = new Set<string>();
  const pairs: string[] = [];
  let cheerChecked = false, reconnectChecked = false;
  const t0 = Date.now();
  while (matchIds.size < 4 && Date.now() - t0 < 12 * 60_000) {
    await A.page.waitForTimeout(2000);
    const hs = await Promise.all(all.map((p) => hooks(p.page)));
    const fighting = hs[0].snapshot?.f?.filter((f: any) => !f.bot).map((f: any) => f.id).sort().join('-');
    if (fighting && pairs[pairs.length - 1] !== fighting) pairs.push(fighting);
    for (const h of hs) if (h.matchOver?.matchId) matchIds.add(h.matchOver.matchId);
    // Spectators see the live fight and their cheers appear on fighters' screens.
    if (!cheerChecked && hs[0].snapshot?.phase === 'fight') {
      const specIdx = hs.findIndex((h) => h.snapshot && !h.snapshot.f.some((f: any) => f.id === h.online?.slot));
      const fighterIdx = hs.findIndex((h) => h.snapshot && h.snapshot.f.some((f: any) => f.id === h.online?.slot));
      if (specIdx >= 0 && fighterIdx >= 0) {
        const before = hs[fighterIdx].cheers ?? 0;
        await all[specIdx].page.click('#cheer-bar [data-cheer="👏"]');
        await all[fighterIdx].page.waitForFunction((n) => ((window as any).__brawl.cheers ?? 0) > n, before, { timeout: 5000 });
        cheerChecked = true;
      }
    }
    // A spectator reconnects; queue order is unchanged afterwards.
    if (cheerChecked && !reconnectChecked && matchIds.size >= 1) {
      const specIdx = hs.findIndex((h) => h.snapshot && !h.snapshot.f.some((f: any) => f.id === h.online?.slot));
      if (specIdx >= 0) {
        const qBefore = await all[0].page.evaluate(() => (window as any).__brawl.roster?.queue ?? null);
        const sp = all[specIdx];
        await sp.ctx.setOffline(true);
        await sp.page.waitForTimeout(3000);
        await sp.ctx.setOffline(false);
        await sp.page.waitForFunction(() => (window as any).__brawl.online?.room, null, { timeout: 15_000 });
        await sp.page.waitForTimeout(1500);
        const qAfter = await all[0].page.evaluate(() => (window as any).__brawl.roster?.queue ?? null);
        console.log('WSO_QUEUE', JSON.stringify({ qBefore, qAfter }));
        if (qBefore && qAfter) expect(qAfter).toEqual(qBefore);
        reconnectChecked = true;
      }
    }
  }
  console.log('WSO', JSON.stringify({ matches: matchIds.size, pairs, cheerChecked, reconnectChecked }));
  expect(matchIds.size).toBeGreaterThanOrEqual(4);
  expect(new Set(pairs).size).toBeGreaterThanOrEqual(3); // different pairings rotated in
  expect(cheerChecked).toBe(true);
  expect(reconnectChecked).toBe(true);

  // Current fighter leaves mid-match: the match is awarded and the next in line takes over.
  await A.page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'fight', null, { timeout: 60_000 });
  const hs = await Promise.all(all.map((p) => hooks(p.page)));
  const fIdx = hs.findIndex((h) => h.snapshot.f.some((f: any) => f.id === h.online?.slot) && h !== hs[0]);
  const leaverSlot = hs[fIdx].online.slot;
  const watcher = all[0];
  await all[fIdx].b.close();
  await watcher.page.waitForFunction((s) => { const mo = (window as any).__brawl.matchOver; return mo && mo.winner !== s; }, leaverSlot, { timeout: 30_000 });
  await watcher.page.waitForFunction((s) => { const f = (window as any).__brawl.snapshot?.f; return f && f.length === 2 && !f.some((x: any) => x.id === s) && (window as any).__brawl.snapshot.phase !== 'match_over'; }, leaverSlot, { timeout: 40_000 });
  for (const p of all.filter((_, i) => i !== fIdx)) expect(realErrors(p.consoleErrors)).toEqual([]);
});
