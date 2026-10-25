// Exports research/drill sessions from Tiger research_frames into replayable fixtures (local only, clips/research/):
// { frames: [{ t, people: [{ world, image }] , label, rep, move, actions }] } in the clips/landmarks format.
// Usage: set -a; . ./.env; set +a; npx tsx tests/tools/export-research.ts <session-id-prefix> ...
import fs from 'fs';
import path from 'path';
import pg from 'pg';
const ROOT = path.resolve(import.meta.dirname, '../..');
const u = new URL(process.env.TIGER_DATABASE_URL!);
u.searchParams.delete('sslmode');
const ca = fs.readFileSync(path.join(ROOT, 'server/certs/timescale-ca.pem'), 'utf8');
const pool = new pg.Pool({ connectionString: u.toString(), ssl: { ca, rejectUnauthorized: true }, max: 2 });
const hasFt = (await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'research_frames' AND column_name = 'ft'`)).rowCount! > 0;
for (const prefix of process.argv.slice(2)) {
  const sid = (await pool.query(`SELECT DISTINCT session_id::text AS s FROM research_frames WHERE session_id::text LIKE $1`, [prefix + '%'])).rows[0]?.s;
  if (!sid) { console.log('no session', prefix); continue; }
  const rows = (await pool.query(`SELECT extract(epoch from time) AS t, ${hasFt ? 'ft' : 'NULL::real AS ft'}, lm, actions, move, label, rep FROM research_frames WHERE session_id = $1 ORDER BY time`, [sid])).rows;
  const t0 = Number(rows[0].t);
  // Row times are when the page stamped the upload batch, not capture times: runs of up to ~9 frames share one
  // millisecond. Rebuild capture times with a rolling linear fit of time against frame index (pose runs at a steady
  // rate, so this is accurate to a frame or two). Sessions recorded after the ft column was added store capture times.
  const raw = rows.map((r: any) => Number(r.t) - t0);
  const W = 25;
  const fit = raw.map((_: number, i: number) => {
    const a = Math.max(0, i - W), b = Math.min(raw.length - 1, i + W);
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    for (let j = a; j <= b; j++) { sx += j; sy += raw[j]; sxx += j * j; sxy += j * raw[j]; n++; }
    const k = (n * sxy - sx * sy) / Math.max(1e-9, n * sxx - sx * sx);
    return sy / n + k * (i - sx / n);
  });
  for (let i = 1; i < fit.length; i++) fit[i] = Math.max(fit[i], fit[i - 1] + 0.01);
  const pts = (a: number[], off: number) => Array.from({ length: 33 }, (_, i) => a.slice(off + i * 4, off + i * 4 + 4).map(Number));
  const frames = rows.map((r: any, i: number) => ({ t: +(r.ft != null && rows[0].ft != null ? Number(r.ft) - Number(rows[0].ft) : fit[i]).toFixed(3), people: [{ world: pts(r.lm, 0), image: pts(r.lm, 132) }], label: r.label, rep: r.rep, move: r.move?.map(Number), actions: r.actions }));
  const out = path.join(ROOT, 'clips/research', sid.slice(0, 8) + '.json');
  fs.writeFileSync(out, JSON.stringify({ name: sid, fps: +(rows.length / (Number(rows[rows.length - 1].t) - t0)).toFixed(1), frames }));
  const labels: Record<string, number> = {};
  for (const f of frames) if (f.label) labels[f.label] = (labels[f.label] ?? 0) + 1;
  console.log(sid, frames.length, 'frames', JSON.stringify(labels));
}
await pool.end();
