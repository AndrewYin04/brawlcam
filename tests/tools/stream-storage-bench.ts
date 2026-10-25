// Measures pose-stream storage per player-hour before and after Timescale compression, using a throwaway hypertable
// with the same schema as pose_streams, filled with one hour (54,000 frames at 15 fps) of real clip landmarks,
// then dropped. Usage: set -a; . ./.env; set +a; npx tsx tests/tools/stream-storage-bench.ts
import fs from 'fs';
import path from 'path';
import pg from 'pg';
const ROOT = path.resolve(import.meta.dirname, '../..');
const u = new URL(process.env.TIGER_DATABASE_URL!);
u.searchParams.delete('sslmode');
const ca = fs.readFileSync(path.join(ROOT, 'server/certs', fs.readdirSync(path.join(ROOT, 'server/certs'))[0]), 'utf8');
const pool = new pg.Pool({ connectionString: u.toString(), ssl: { ca, rejectUnauthorized: true }, max: 2 });
const clips = ['jab_01', 'hook_01', 'guard_02', 'block_01', 'shadow_fighterD', 'kick_01'];
const frames: number[][] = [];
for (const c of clips) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/landmarks', c + '.json'), 'utf8'));
  for (const f of d.frames) if (f.people[0]) frames.push(f.people[0].world.flatMap((l: number[]) => [+l[0].toFixed(3), +l[1].toFixed(3), +l[2].toFixed(3), +(l[3] ?? 0).toFixed(2)]));
}
const T = 'pose_streams_bench';
const q = (s: string, v?: unknown[]) => pool.query(s, v);
await q(`DROP TABLE IF EXISTS ${T}`);
const LAYOUT = process.env.LAYOUT ?? 'columns';
const COLS = Array.from({ length: 33 }, (_, j) => [`x${j}`, `y${j}`, `z${j}`, `v${j}`]).flat();
if (LAYOUT === 'columns') await q(`CREATE TABLE ${T} (time timestamptz NOT NULL, session_id uuid NOT NULL, label text NOT NULL, ${COLS.map((c) => c + ' smallint').join(', ')})`);
else await q(`CREATE TABLE ${T} (time timestamptz NOT NULL, session_id uuid NOT NULL, label text NOT NULL, lm real[] NOT NULL)`);
await q(`SELECT create_hypertable('${T}', by_range('time', INTERVAL '1 day'))`);
await q(`ALTER TABLE ${T} SET (timescaledb.compress, timescaledb.compress_segmentby = 'session_id', timescaledb.compress_orderby = 'time')`);
const N = 15 * 3600;
const sess = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'];
const t0 = Date.parse('2026-10-01T00:00:00Z');
const B = LAYOUT === 'columns' ? 200 : 500;
for (let i = 0; i < N; i += B) {
  const vals: unknown[] = [];
  const ph: string[] = [];
  for (let k = i; k < Math.min(N, i + B); k++) {
    const s = sess[Math.floor(k / (N / 6))]; // six 10-minute sessions = one player-hour
    const fr = frames[k % frames.length];
    if (LAYOUT === 'columns') {
      // millimetres (x, y, z) and visibility in percent, as smallints
      const row = fr.map((v, i) => (i % 4 === 3 ? Math.round(v * 100) : Math.round(v * 1000)));
      const o = vals.length;
      vals.push(new Date(t0 + (k * 1000) / 15), s, 'practice', ...row);
      ph.push(`(${Array.from({ length: 3 + 132 }, (_, i) => '$' + (o + i + 1)).join(',')})`);
    } else {
      vals.push(new Date(t0 + (k * 1000) / 15), s, 'practice', fr);
      const o = ph.length * 4;
      ph.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4})`);
    }
  }
  await q(`INSERT INTO ${T} VALUES ${ph.join(',')}`, vals);
}
const before = (await q(`SELECT hypertable_size('${T}')::bigint AS b`)).rows[0].b;
await q(`SELECT compress_chunk(c) FROM show_chunks('${T}') c`);
const st = (await q(`SELECT sum(before_compression_total_bytes)::bigint AS b, sum(after_compression_total_bytes)::bigint AS a FROM hypertable_compression_stats('${T}')`)).rows[0];
const after = (await q(`SELECT hypertable_size('${T}')::bigint AS b`)).rows[0].b;
const mb = (x: unknown) => (Number(x) / 1048576).toFixed(2);
console.log(JSON.stringify({ layout: LAYOUT, frames: N, playerHours: 1, uncompressedTableMB: mb(before), compressedTableMB: mb(after), statsBeforeMB: mb(st.b), statsAfterMB: mb(st.a), ratio: +(Number(st.b) / Number(st.a)).toFixed(1), playerHoursPer600MB: Math.floor(600 / (Number(after) / 1048576)) }));
await q(`DROP TABLE ${T}`);
await pool.end();
