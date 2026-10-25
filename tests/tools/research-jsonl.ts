// Converts a research JSONL saved by the game (exact capture times, labels, recorded move/actions) into a replay
// fixture in clips/research/<session8>-exact.json (local only). Usage: npx tsx tests/tools/research-jsonl.ts <file.jsonl> ...
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
for (const file of process.argv.slice(2)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const head = lines.shift();
  const frames = lines.filter((l) => l.world && l.image).map((l) => ({ t: l.t, people: [{ world: l.world, image: l.image }], label: l.label ?? null, rep: l.rep ?? null, move: l.move, actions: l.actions ?? null, at: l.at }));
  const t0 = frames[0].t;
  for (const f of frames) f.t = +(f.t - t0).toFixed(3);
  const out = path.join(ROOT, 'clips/research', head.sessionId.slice(0, 8) + '-exact.json');
  fs.writeFileSync(out, JSON.stringify({ name: head.sessionId, startedAt: head.startedAt, frames }));
  const dts = frames.slice(1).map((f, i) => f.t - frames[i].t).sort((a, b) => a - b);
  console.log(path.basename(out), frames.length, 'frames, dt median', dts[dts.length >> 1].toFixed(3), 'max', dts[dts.length - 1].toFixed(3), 'labeled', frames.filter((f) => f.label).length);
}
