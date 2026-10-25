// Plays real online matches through the real UI and server between clip-driven players with demo names, so the
// leaderboard shows genuinely played matches (no rows are written by hand). Usage: npx tsx tests/tools/demo-matches.ts
import { chromium, type Page } from '@playwright/test';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.BASE_URL ?? 'https://throwhands.tech';
const GL = ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'];
const Q = '&lowgfx&skipcal&nocomment&aifixture&notut';
async function player(clip: string, nick: string, url: string) {
  const b = await chromium.launch({ args: [...GL, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${path.join(ROOT, 'clips', clip + '.mjpeg')}`] });
  const ctx = await b.newContext({ permissions: ['camera'], viewport: { width: 800, height: 450 } });
  // One stable player id per name (so "Maya" is one player across matches).
  const ids: Record<string, string> = { Maya: '0d6f1e2a-4b1c-4e1a-9b51-1a2b3c4d5e01', Leo: '0d6f1e2a-4b1c-4e1a-9b51-1a2b3c4d5e02', Priya: '0d6f1e2a-4b1c-4e1a-9b51-1a2b3c4d5e03', Sam: '0d6f1e2a-4b1c-4e1a-9b51-1a2b3c4d5e04' };
  await ctx.addInitScript(([n, id]) => { localStorage.setItem('throwhands.nick', n); localStorage.setItem('throwhands.id', id); }, [nick, ids[nick]] as const);
  const page = await ctx.newPage();
  await page.goto(BASE + url);
  return { b, page };
}
const H = (p: Page) => p.evaluate(() => (window as any).__brawl);
async function match(a: [string, string], b: [string, string]) {
  const A = await player(a[0], a[1], '/?x=1' + Q);
  await A.page.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 90_000 });
  await A.page.click('[data-action=online-create]');
  await A.page.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 30_000 });
  const room = (await H(A.page)).online.room;
  const B = await player(b[0], b[1], `/?room=${room}` + Q);
  await B.page.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 90_000 });
  await A.page.waitForTimeout(1500);
  await A.page.click('#lobby-start');
  await A.page.waitForFunction(() => (window as any).__brawl?.matchOver, null, { timeout: 8 * 60_000, polling: 1000 });
  const over = (await H(A.page)).matchOver;
  console.log(`${a[1]} vs ${b[1]}: winner slot ${over?.winner}`, JSON.stringify(over?.elo ?? over?.elo_delta ?? ''));
  await A.b.close();
  await B.b.close();
}
const pairs: [[string, string], [string, string]][] = [
  [['shadow_fighterA', 'Maya'], ['shadow_fighterB', 'Leo']],
  [['shadow_fighterC', 'Priya'], ['shadow_fighterD', 'Sam']],
  [['shadow_fighterE', 'Maya'], ['shadow_fighterF', 'Priya']],
  [['shadow_fighterG', 'Leo'], ['shadow_fighterH', 'Sam']],
];
for (const [a, b] of pairs) await match(a, b).catch((e) => console.log('match failed', a[1], b[1], String(e).slice(0, 200)));
