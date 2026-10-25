// Tiger Data (PostgreSQL + TimescaleDB) access. Every call fails soft: the game runs without a database.
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { eloUpdate } from '../shared/elo';

let pool: pg.Pool | null = null;
export const dbState = { ok: false, error: '' as string, lastErrorAt: 0 };

function caCert(): string | undefined {
  const candidates = [path.join(process.cwd(), 'server/certs/timescale-ca.pem'), path.join(process.cwd(), 'certs/timescale-ca.pem'), '/srv/brawlcam/certs/timescale-ca.pem'];
  for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  return undefined;
}

export async function initDb(): Promise<boolean> {
  const url = process.env.TIGER_DATABASE_URL;
  if (!url) {
    dbState.error = 'TIGER_DATABASE_URL not set';
    return false;
  }
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    const ca = caCert();
    pool = new pg.Pool({
      connectionString: u.toString(),
      // Verify the server against Timescale's CA (pinned in server/certs) and check the hostname.
      ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true },
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (e) => fail(e));
    await migrate();
    dbState.ok = true;
    dbState.error = '';
    return true;
  } catch (e) {
    fail(e);
    return false;
  }
}

function fail(e: unknown) {
  dbState.ok = false;
  dbState.error = String((e as Error)?.message ?? e);
  dbState.lastErrorAt = Date.now();
  console.error('[db]', dbState.error);
}

async function q<T extends pg.QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[] | null> {
  if (!pool) return null;
  try {
    const r = await pool.query<T>(sql, params);
    dbState.ok = true;
    return r.rows;
  } catch (e) {
    fail(e);
    return null;
  }
}

async function migrate() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS players (id uuid PRIMARY KEY, nickname text NOT NULL, elo int NOT NULL DEFAULT 1000, wins int NOT NULL DEFAULT 0, losses int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS matches (id uuid PRIMARY KEY, mode text NOT NULL, p1 uuid, p2 uuid, winner uuid, started_at timestamptz, ended_at timestamptz)`,
    `CREATE TABLE IF NOT EXISTS match_events (time timestamptz NOT NULL, match_id uuid, actor uuid, type text NOT NULL, damage int, speed real)`,
    `SELECT create_hypertable('match_events', by_range('time'), if_not_exists => TRUE)`,
    `CREATE INDEX IF NOT EXISTS match_events_actor_time ON match_events (actor, time DESC)`,
    `CREATE TABLE IF NOT EXISTS pose_samples (time timestamptz NOT NULL, session_id uuid NOT NULL, label text NOT NULL, landmarks jsonb NOT NULL)`,
    `SELECT create_hypertable('pose_samples', by_range('time'), if_not_exists => TRUE)`,
    // Research recording (?research=1, explicit consent per session): landmark/action/marker stream, never video.
    // lm = 33 world + 33 image landmarks, [x, y, z, visibility] each (264 reals).
    `CREATE TABLE IF NOT EXISTS research_frames (time timestamptz NOT NULL, session_id uuid NOT NULL, tag text NOT NULL DEFAULT 'research', lm real[] NOT NULL, actions text[], move real[], marker text)`,
    `SELECT create_hypertable('research_frames', by_range('time', INTERVAL '1 day'), if_not_exists => TRUE)`,
    `ALTER TABLE research_frames SET (timescaledb.compress, timescaledb.compress_segmentby = 'session_id', timescaledb.compress_orderby = 'time')`,
    `SELECT add_compression_policy('research_frames', compress_after => INTERVAL '1 hour', if_not_exists => TRUE)`,
    // Continuous aggregates. materialized_only = false enables real-time aggregation (off by default since 2.13).
    `CREATE MATERIALIZED VIEW IF NOT EXISTS leaderboard_daily WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
       SELECT time_bucket('1 day', time) AS day, actor,
         count(*) FILTER (WHERE type = 'hit') AS hits,
         count(*) FILTER (WHERE type = 'ko') AS kos,
         coalesce(sum(damage) FILTER (WHERE type = 'hit'), 0) AS damage,
         max(speed) FILTER (WHERE type = 'hit') AS fastest_punch,
         coalesce(sum(speed) FILTER (WHERE type = 'match_end'), 0) AS fight_seconds
       FROM match_events WHERE actor IS NOT NULL GROUP BY day, actor WITH NO DATA`,
    `SELECT add_continuous_aggregate_policy('leaderboard_daily', start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE)`,
    `CREATE MATERIALIZED VIEW IF NOT EXISTS motion_label_counts WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
       SELECT time_bucket('1 hour', time) AS bucket, label, count(*) AS samples, count(DISTINCT session_id) AS sessions
       FROM pose_samples GROUP BY bucket, label WITH NO DATA`,
    `SELECT add_continuous_aggregate_policy('motion_label_counts', start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE)`,
  ];
  for (const s of stmts) await pool!.query(s);
}

export async function upsertPlayer(id: string, nickname: string) {
  await q(`INSERT INTO players (id, nickname) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, updated_at = now()`, [id, nickname]);
}

/** Record a finished 1v1 and update both players' Elo. Returns Elo deltas by client id, or null on failure. */
export async function recordDuel(m: { id: string; mode: string; a: { id: string; nick: string }; b: { id: string; nick: string }; winner: string | null; startedAt: Date; endedAt: Date }) {
  if (!pool) return null;
  await upsertPlayer(m.a.id, m.a.nick);
  await upsertPlayer(m.b.id, m.b.nick);
  const rows = await q<{ id: string; elo: number }>(`SELECT id, elo FROM players WHERE id = ANY($1::uuid[])`, [[m.a.id, m.b.id]]);
  if (!rows) return null;
  const ra = rows.find((r) => r.id === m.a.id)?.elo ?? 1000;
  const rb = rows.find((r) => r.id === m.b.id)?.elo ?? 1000;
  const score = m.winner === m.a.id ? 1 : m.winner === m.b.id ? 0 : 0.5;
  const d = eloUpdate(ra, rb, score);
  const ok =
    (await q(`UPDATE players SET elo = elo + $2, wins = wins + $3, losses = losses + $4, updated_at = now() WHERE id = $1`, [m.a.id, d.deltaA, score === 1 ? 1 : 0, score === 0 ? 1 : 0])) &&
    (await q(`UPDATE players SET elo = elo + $2, wins = wins + $3, losses = losses + $4, updated_at = now() WHERE id = $1`, [m.b.id, d.deltaB, score === 0 ? 1 : 0, score === 1 ? 1 : 0])) &&
    (await q(`INSERT INTO matches (id, mode, p1, p2, winner, started_at, ended_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [m.id, m.mode, m.a.id, m.b.id, m.winner, m.startedAt, m.endedAt]));
  if (!ok) return null;
  return { [m.a.id]: d.deltaA, [m.b.id]: d.deltaB };
}

export async function recordMatch(m: { id: string; mode: string; ids: string[]; winner: string | null; startedAt: Date; endedAt: Date }) {
  await q(`INSERT INTO matches (id, mode, p1, p2, winner, started_at, ended_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [m.id, m.mode, m.ids[0] ?? null, m.ids[1] ?? null, m.winner, m.startedAt, m.endedAt]);
}

// ---- match events (batched) ----
type EventRow = [Date, string, string | null, string, number | null, number | null];
let buffer: EventRow[] = [];
export function queueEvent(row: EventRow) {
  buffer.push(row);
  if (buffer.length > 5000) buffer.splice(0, buffer.length - 5000);
}
export async function flushEvents() {
  if (!pool || !buffer.length) return;
  const rows = buffer.splice(0, 1000);
  const vals: unknown[] = [];
  const ph = rows.map((r, i) => {
    vals.push(...r);
    const o = i * 6;
    return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6})`;
  });
  const res = await q(`INSERT INTO match_events (time, match_id, actor, type, damage, speed) VALUES ${ph.join(',')}`, vals);
  if (!res) buffer.unshift(...rows.slice(0, 2000)); // retry later
}
setInterval(() => void flushEvents(), 2000).unref();

export async function leaderboard(limit = 25) {
  // Players have no accounts: identity is a per-browser id, so nicknames can repeat. Shared names get a short tag.
  const rows = await q(
    `SELECT p.id, p.nickname, p.elo, p.wins, p.losses,
       coalesce(max(l.fastest_punch), 0) AS fastest_punch,
       coalesce(sum(l.kos), 0)::int AS kos,
       CASE WHEN coalesce(sum(l.fight_seconds), 0) > 0 THEN round((sum(l.damage) / (sum(l.fight_seconds) / 60.0))::numeric, 1) ELSE 0 END AS dmg_per_min
     , count(*) OVER (PARTITION BY lower(p.nickname)) AS name_count
     FROM players p LEFT JOIN leaderboard_daily l ON l.actor = p.id
     GROUP BY p.id ORDER BY p.elo DESC, p.wins DESC LIMIT $1`,
    [limit],
  );
  return rows?.map((r: any) => ({ ...r, name_count: undefined, tag: Number(r.name_count) > 1 ? '#' + String(r.id).slice(0, 4) : null })) ?? null;
}

export async function getPlayer(id: string) {
  const r = await q(`SELECT id, nickname, elo, wins, losses FROM players WHERE id = $1`, [id]);
  return r?.[0] ?? null;
}

// ---- motion data (opt-in, anonymized: session id only, no player id, no video) ----
export async function insertPoseSamples(sessionId: string, samples: { t: number; label: string; landmarks: number[][][] }[]) {
  if (!samples.length) return true;
  const vals: unknown[] = [];
  const ph = samples.map((s, i) => {
    vals.push(new Date(s.t), sessionId, s.label, JSON.stringify(s.landmarks));
    const o = i * 4;
    return `($${o + 1},$${o + 2},$${o + 3},$${o + 4})`;
  });
  return !!(await q(`INSERT INTO pose_samples (time, session_id, label, landmarks) VALUES ${ph.join(',')}`, vals));
}

export async function insertResearchFrames(sessionId: string, frames: { t: number; lm: number[]; acts: string[]; mv: number[]; mk: string | null }[]) {
  if (!frames.length) return true;
  const vals: unknown[] = [];
  const ph = frames.map((f, i) => {
    vals.push(new Date(f.t), sessionId, f.lm, f.acts, f.mv, f.mk);
    const o = i * 6;
    return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6})`;
  });
  return !!(await q(`INSERT INTO research_frames (time, session_id, lm, actions, move, marker) VALUES ${ph.join(',')}`, vals));
}

export async function researchStats() {
  return q(`SELECT count(*)::int AS frames, count(DISTINCT session_id)::int AS sessions, count(marker)::int AS markers FROM research_frames`);
}

export async function motionStats() {
  return q(`SELECT label, sum(samples)::int AS samples, sum(sessions)::int AS sessions FROM motion_label_counts GROUP BY label ORDER BY samples DESC`);
}

export async function motionSample(label?: string, limit = 60) {
  return q(
    `SELECT time, session_id, label, landmarks FROM pose_samples WHERE ($1::text IS NULL OR label = $1)
     AND session_id = (SELECT session_id FROM pose_samples WHERE ($1::text IS NULL OR label = $1) ORDER BY time DESC LIMIT 1)
     ORDER BY time LIMIT $2`,
    [label ?? null, limit],
  );
}
