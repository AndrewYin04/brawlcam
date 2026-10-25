// Debug: 3 browsers in a brawl with bots; print the first tick whose state differs between clients.
import { launchWithClip, openPage, hooks, waitScreen, TQ } from '../e2e/helpers';
const clips = ['shadow_fighterA', 'shadow_fighterB', 'jab_01'];
const ps: any[] = [];
const A = await launchWithClip(clips[0]);
const a = await openPage(A, `/?${TQ}&roundsecs=40`);
await waitScreen(a.page, 'menu');
await a.page.click('[data-action=online-create]');
await a.page.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 20000 });
const room = (await hooks(a.page)).online.room;
ps.push({ b: A, ...a });
for (const c of clips.slice(1)) { const b = await launchWithClip(c); const p = await openPage(b, `/?room=${room}&${TQ}`); await waitScreen(p.page, 'lobby'); ps.push({ b, ...p }); }
await a.page.check('input[name=mode][value=brawl]');
await a.page.click('#lobby-start');
for (const p of ps) await waitScreen(p.page, 'game');
let shown = 0, samples = 0, mism = 0;
for (let k = 0; k < 10; k++) {
  await a.page.waitForTimeout(3000);
  const logs = await Promise.all(ps.map((p) => p.page.evaluate(() => (window as any).__brawl.snapLog.splice(0))));
  const ref = new Map(logs[0].map((x: any) => [x.t, x]));
  for (const lg of logs.slice(1)) for (const x of lg) { const y: any = ref.get(x.t); if (!y) continue; samples++; if (JSON.stringify(x.f) !== JSON.stringify(y.f) || x.timer !== y.timer) { mism++; if (shown++ < 2) console.log('MISMATCH t', x.t, '\n A', JSON.stringify(y), '\n B', JSON.stringify(x)); } }
  const dup = logs[0].filter((x: any, i: number, arr: any[]) => arr.findIndex((z) => z.t === x.t) !== i).length;
  if (dup) console.log('duplicate t entries in client log:', dup);
}
console.log('samples', samples, 'mismatches', mism);
for (const p of ps) await p.b.close();
