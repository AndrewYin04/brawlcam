import { test, expect } from '@playwright/test';
import { launchWithClip, openPage, waitScreen, TQ } from './helpers';

// REVIEW.md 7:58 AM ("it's still saying 'what a fight' after every player wins"): three real matches in a row against
// the passive bot (jab clip as the webcam), rematching from the results screen. Per match: exactly one result call, no
// separate "K.O.!" call right before it, at most one "fight" word from the last call before the result through the
// rematch prompt, and the rematch prompt follows. Across matches: never the same result twice in a row.
test('match-end calls: one result per match, no "fight" pile-up, rematch prompt, no back-to-back repeats', async () => {
  test.setTimeout(12 * 60_000);
  const browser = await launchWithClip('jab_01');
  const { page } = await openPage(browser, `/?mode=practice&skipcal&${TQ}&botlevel=-1`);
  await waitScreen(page, 'game');
  const fightWords = (s: string) => (s.match(/\bfight\b/gi) ?? []).length;
  const results: { result: string; ctx: string; before: string; tail: string[]; rounds: string[] }[] = [];
  for (let m = 0; m < 3; m++) {
    const start = await page.evaluate(() => Date.now());
    await page.waitForFunction(() => (window as any).__brawl.snapshot?.phase === 'match_over', null, { timeout: 220_000, polling: 500 });
    // The result plays 1.2 s after match over (or at the KO); the rematch prompt follows it.
    await page.waitForFunction((t0) => (window as any).__brawl.announcer().some((c: any) => c.at >= t0 && c.key === 'rematch'), start, { timeout: 20_000, polling: 250 });
    const log = (await page.evaluate(() => (window as any).__brawl.announcer())).filter((c: any) => c.at >= start);
    const rounds = (await page.evaluate(() => (window as any).__brawl.events)).filter((e: any) => e.type === 'round_end').map((e: any) => e.reason);
    const ri = log.findIndex((c: any) => c.key === 'match_over' || c.key === 'draw');
    const res = log.filter((c: any) => c.key === 'match_over' || c.key === 'draw');
    const tail = log.slice(Math.max(0, ri - 1)).map((c: any) => `${c.key}:${c.text}`);
    results.push({ result: res.map((c: any) => c.text).join(' + '), ctx: res.map((c: any) => c.ctx).join('+'), before: ri > 0 ? log[ri - 1].key : '', tail, rounds });
    console.log(`MATCH_END ${m + 1}`, JSON.stringify({ calls: log.map((c: any) => `${c.key}:${c.text}`), result: res.map((c: any) => `${c.ctx}:${c.text}`) }));
    expect(res.length).toBe(1);
    expect(ri > 0 ? log[ri - 1].key : '').not.toBe('ko');
    expect(log.slice(Math.max(0, ri - 1)).reduce((n: number, c: any) => n + fightWords(c.text), 0)).toBeLessThanOrEqual(1);
    expect(log.slice(ri + 1).some((c: any) => c.key === 'rematch')).toBe(true);
    if (m < 2) {
      await page.waitForSelector('#screen-results.active', { timeout: 15_000 });
      await page.click('#res-rematch');
      await waitScreen(page, 'game', 10_000);
      await page.waitForFunction(() => (window as any).__brawl.snapshot?.round === 1 && (window as any).__brawl.snapshot?.phase !== 'match_over', null, { timeout: 15_000 });
    }
  }
  console.log('MATCH_ENDS', JSON.stringify(results.map((r) => r.result)));
  for (let i = 1; i < results.length; i++) expect(results[i].result).not.toBe(results[i - 1].result);
  await browser.close();
});
