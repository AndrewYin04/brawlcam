// Deletes rows written by automated tests from Tiger Data: players named "E2E ..." (and the protocol smoke test's
// Alice/Bob), their matches and match events. With --pose-samples-before=<ISO time>, also deletes pose samples
// recorded before that time (test runs replay third-party clips, so those samples are not real player data).
import pg from 'pg';
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const u = new URL(env.TIGER_DATABASE_URL);
u.searchParams.delete('sslmode');
const c = new pg.Client({ connectionString: u.toString(), ssl: { ca: fs.readFileSync(path.join(ROOT, 'server/certs/timescale-ca.pem'), 'utf8') } });
await c.connect();
const extra = (process.env.EXTRA_NICKS ?? '').split(',').filter(Boolean);
const ids = (await c.query(`SELECT id FROM players WHERE nickname LIKE 'E2E%' OR nickname = ANY($1)`, [extra])).rows.map((r) => r.id);
console.log('test players', ids.length);
if (ids.length) {
  const e = await c.query(`DELETE FROM match_events WHERE actor = ANY($1::uuid[]) OR match_id IN (SELECT id FROM matches WHERE p1 = ANY($1::uuid[]) OR p2 = ANY($1::uuid[]))`, [ids]);
  const m = await c.query(`DELETE FROM matches WHERE p1 = ANY($1::uuid[]) OR p2 = ANY($1::uuid[]) OR winner = ANY($1::uuid[])`, [ids]);
  const p = await c.query(`DELETE FROM players WHERE id = ANY($1::uuid[])`, [ids]);
  console.log('deleted events', e.rowCount, 'matches', m.rowCount, 'players', p.rowCount);
}
const before = process.argv.find((a) => a.startsWith('--pose-samples-before='))?.split('=')[1];
if (before) {
  const r = await c.query(`DELETE FROM pose_samples WHERE time < $1`, [before]);
  console.log('deleted pose samples', r.rowCount);
}
// Refresh the continuous aggregates so the leaderboard and dashboard reflect the deletes.
await c.query(`CALL refresh_continuous_aggregate('leaderboard_daily', NULL, NULL)`);
await c.query(`CALL refresh_continuous_aggregate('motion_label_counts', NULL, NULL)`);
await c.end();
