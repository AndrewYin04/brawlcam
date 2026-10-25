// Throw Hands server: WebSocket relay (authoritative rooms) + API proxy (Gemini, Meta, Tiger Data).
import http from 'http';
import dns from 'dns';
import net from 'net';

// Meta's API returns an empty model list to this VM's IPv6 range (verified 2026-10-24: IPv4 works, IPv6 gets 404
// model_not_found). Prefer IPv4 for all outbound calls.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import fs from 'fs';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager, type Room, type MatchSummary } from './rooms';
import * as db from './db';
import * as ai from './ai';

const PORT = Number(process.env.PORT ?? 8787);
const startedAt = new Date().toISOString();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

void db.initDb().then((ok) => console.log('[db]', ok ? 'connected' : 'unavailable: ' + db.dbState.error));

const rooms = new RoomManager({
  rivalry: (input, room) => (room.aiFixtures ? Promise.resolve(ai.fixtureRivalry(input)) : ai.rivalryCard(input)),
  async commentary(summary, voice, room) {
    if (room.aiFixtures) return { text: 'Fixture commentary: what a punch!', source: 'fixture', audio: null };
    const line = await ai.commentaryLine(summary);
    const audio = voice && process.env.LIVE_TTS === '1' && line.source !== 'template' ? await ai.speak(line.text, ai.moodFor(summary)) : null;
    return { text: line.text, source: line.source, audio: audio ? `data:${audio.mime};base64,${audio.b64}` : null };
  },
  async onMatchOver(room: Room, m: MatchSummary) {
    const humans = m.fighters.filter((f) => !f.bot && f.clientId && UUID.test(f.clientId));
    // One row per fighter so the leaderboard can compute damage per minute.
    const secs = (m.endedAt.getTime() - m.startedAt.getTime()) / 1000;
    for (const f of humans) db.queueEvent([m.endedAt, m.matchId, f.clientId, 'match_end', f.damage, secs]);
    if ((m.mode === 'duel' || m.mode === 'wso') && humans.length === 2) {
      const [a, b] = humans;
      const d = await db.recordDuel({ id: m.matchId, mode: m.mode, a: { id: a.clientId!, nick: a.nickname }, b: { id: b.clientId!, nick: b.nickname }, winner: m.winnerClient, startedAt: m.startedAt, endedAt: m.endedAt });
      if (d) return { [a.slot]: d[a.clientId!], [b.slot]: d[b.clientId!] };
    } else {
      for (const f of humans) await db.upsertPlayer(f.clientId!, f.nickname);
      await db.recordMatch({ id: m.matchId, mode: m.mode, ids: humans.map((h) => h.clientId!), winner: m.winnerClient && UUID.test(m.winnerClient) ? m.winnerClient : null, startedAt: m.startedAt, endedAt: m.endedAt });
    }
  },
  onEvents(room: Room, events) {
    const now = new Date();
    const actorOf = (slot: number | null) => {
      if (slot == null) return null;
      const c = room.people.find((p) => p.slot === slot);
      return c && UUID.test(c.id) ? c.id : null;
    };
    for (const e of events) {
      if (e.type === 'hit') db.queueEvent([now, room.matchId, actorOf(e.attacker), e.isSuper ? 'super' : 'hit', e.damage, e.speed || null]);
      else if (e.type === 'ko') db.queueEvent([now, room.matchId, actorOf(e.attacker), 'ko', null, null]);
      else if (e.type === 'super') db.queueEvent([now, room.matchId, actorOf(e.id), 'super_used', null, null]);
    }
  },
});

// ---------------- HTTP ----------------

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage, limit = 256 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

// Simple per-IP rate limiting for the AI endpoints.
const hits = new Map<string, number[]>();
function rateOk(req: http.IncomingMessage, key: string, perMinute: number) {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  const k = key + ':' + ip;
  const now = Date.now();
  const arr = (hits.get(k) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= perMinute) return false;
  arr.push(now);
  hits.set(k, arr);
  return true;
}

function sendFile(res: http.ServerResponse, file: string | null, type: string) {
  if (!file) return send(res, 404, { error: 'not found' });
  res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=86400' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/health') {
      return send(res, 200, { ok: true, startedAt, rooms: rooms.rooms.size, db: { ok: db.dbState.ok, error: db.dbState.ok ? '' : db.dbState.error.slice(0, 120) }, ai: { metaSpendUsd: +ai.aiState.metaSpendUsd.toFixed(4), metaCapped: ai.aiState.metaCapped, geminiCalls: ai.aiState.geminiCalls, gemini429: ai.aiState.gemini429, tts429: ai.aiState.tts429, lastMetaError: ai.aiState.lastMetaError, lastGeminiError: ai.aiState.lastGeminiError } });
    }
    if (p === '/api/room' && req.method === 'POST') {
      const r = rooms.create();
      return send(res, 200, { code: r.code });
    }
    if (p.startsWith('/api/room/') && req.method === 'GET') {
      const r = rooms.get(p.split('/')[3] ?? '');
      if (!r) return send(res, 404, { error: 'room_not_found', message: 'No room with that code.' });
      return send(res, 200, { code: r.code, people: r.people.length, full: r.people.length >= 8, mode: r.mode });
    }
    if (p === '/api/leaderboard') {
      const rows = await db.leaderboard(Number(url.searchParams.get('limit') ?? 25));
      if (!rows) return send(res, 503, { error: 'db_unavailable', message: 'The leaderboard is taking a breather. The game still works!' });
      return send(res, 200, { players: rows });
    }
    if (p.startsWith('/api/player/')) {
      const id = p.split('/')[3] ?? '';
      if (!UUID.test(id)) return send(res, 400, { error: 'bad id' });
      const row = await db.getPlayer(id);
      return send(res, row ? 200 : 404, row ?? { error: 'not found' });
    }
    if (p === '/api/forge' && req.method === 'POST') {
      if (!rateOk(req, 'forge', 10)) return send(res, 429, { error: 'slow down', message: 'Too many forges. Try again in a minute.' });
      const body = await readBody(req);
      const result = await ai.forge(String(body.prompt ?? ''));
      return send(res, 200, result);
    }
    if (p === '/api/forge/image' && req.method === 'POST') {
      if (!rateOk(req, 'forgeimg', 6)) return send(res, 429, { error: 'slow down' });
      const body = await readBody(req);
      const img = await ai.forgeImage(String(body.prompt ?? ''), String(body.imagePrompt ?? ''), 13000);
      return send(res, img ? 200 : 503, img ? { image: img } : { error: 'image_unavailable' });
    }
    if (p.startsWith('/api/forge/image/')) return sendFile(res, ai.forgeImagePath(p.split('/')[4] ?? ''), 'image/jpeg');
    if (p === '/api/commentary' && req.method === 'POST') {
      if (!rateOk(req, 'comment', 40)) return send(res, 429, { error: 'slow down' });
      const body = await readBody(req);
      const line = await ai.commentaryLine(String(body.summary ?? ''));
      const audio = body.voice && line.source !== 'template' ? await ai.speak(line.text, ai.moodFor(String(body.summary ?? ''))) : null;
      return send(res, 200, { text: line.text, source: line.source, audio: audio ? `data:${audio.mime};base64,${audio.b64}` : null });
    }
    if (p.startsWith('/api/rivalry/image/')) return sendFile(res, ai.rivalryPath(p.split('/')[4] ?? '', 'jpg'), 'image/jpeg');
    if (p.startsWith('/api/rivalry/')) {
      const f = ai.rivalryPath(p.split('/')[3] ?? '', 'json');
      return f ? send(res, 200, JSON.parse(fs.readFileSync(f, 'utf8'))) : send(res, 404, { error: 'not found' });
    }
    if (p === '/api/pose-samples' && req.method === 'POST') {
      // Opt-in only (the client sends nothing unless the player ticked the consent box). No player id, no video.
      if (!rateOk(req, 'pose', 30)) return send(res, 429, { error: 'slow down' });
      const b = await readBody(req, 512 * 1024);
      if (b.consent !== true || !UUID.test(String(b.sessionId ?? ''))) return send(res, 400, { error: 'consent and sessionId required' });
      const allowed = new Set(['jab', 'hook', 'uppercut', 'block', 'xshield', 'palm', 'kick', 'dodge', 'guard']);
      const samples = (Array.isArray(b.samples) ? b.samples : [])
        .slice(0, 200)
        // Each sample is one labeled sequence: up to 30 frames of 33 landmarks [x, y, z, visibility].
        .filter((s: any) => allowed.has(s?.label) && Array.isArray(s?.landmarks) && s.landmarks.length > 0 && s.landmarks.length <= 30 && s.landmarks.every((fr: any) => Array.isArray(fr) && fr.length <= 33))
        .map((s: any) => ({ t: Math.min(Date.now(), Number(s.t) || Date.now()), label: s.label, landmarks: s.landmarks.map((fr: any[]) => fr.map((v: any) => (Array.isArray(v) ? v.slice(0, 4).map((x: any) => +(Number(x) || 0).toFixed(4)) : []))) }));
      const ok = await db.insertPoseSamples(b.sessionId, samples);
      return send(res, ok ? 200 : 503, { stored: ok ? samples.length : 0 });
    }
    if (p === '/api/research' && req.method === 'POST') {
      // Research recording: only after the player's explicit consent (sent with every batch). Landmarks only, no video.
      if (!rateOk(req, 'research', 60)) return send(res, 429, { error: 'slow down' });
      const b = await readBody(req, 1024 * 1024);
      if (b.consent !== true || !UUID.test(String(b.sessionId ?? ''))) return send(res, 400, { error: 'consent and sessionId required' });
      const num = (x: unknown) => +(Number(x) || 0).toFixed(4);
      const frames = (Array.isArray(b.frames) ? b.frames : [])
        .slice(0, 150)
        .filter((f: any) => Array.isArray(f?.lm) && f.lm.length === 264)
        .map((f: any) => ({
          // Row time is clamped to the server clock (a client clock running ahead collapses frames onto one instant),
          // so the frame's capture time on the page's pose clock is stored separately for exact replay.
          t: Math.min(Date.now(), Number(f.t) || Date.now()),
          ft: Number.isFinite(Number(f.ft)) ? Number(f.ft) : null,
          lm: f.lm.map(num),
          acts: (Array.isArray(f.acts) ? f.acts : []).slice(0, 8).map((a: unknown) => String(a).slice(0, 32)),
          mv: (Array.isArray(f.mv) ? f.mv : [0, 0]).slice(0, 2).map(num),
          mk: f.mk == null ? null : String(f.mk).slice(0, 32),
          lb: f.lb == null ? null : String(f.lb).slice(0, 32),
          rp: Number.isFinite(Number(f.rp)) ? Math.max(0, Math.min(1000, Math.round(Number(f.rp)))) : null,
        }));
      const ok = await db.insertResearchFrames(b.sessionId, frames);
      return send(res, ok ? 200 : 503, { stored: ok ? frames.length : 0 });
    }
    if (p === '/api/pose-stream' && req.method === 'POST') {
      // Opt-in continuous pose stream (motion-data consent). Anonymous session id, landmarks only, no video.
      if (!rateOk(req, 'stream', 45)) return send(res, 429, { error: 'slow down' });
      const b = await readBody(req, 512 * 1024);
      if (b.consent !== true || !UUID.test(String(b.sessionId ?? ''))) return send(res, 400, { error: 'consent and sessionId required' });
      if ((await db.databaseBytes()) > db.STREAM_DB_LIMIT) {
        console.warn('[stream] database over 600 MB: stream inserts paused');
        return send(res, 507, { error: 'storage_full', stored: 0 });
      }
      const label = ['practice', 'local2p', 'online', 'brawl', 'demo'].includes(b.label) ? b.label : 'other';
      const t0 = Math.min(Date.now(), Number(b.t0) || Date.now());
      const rows = (Array.isArray(b.frames) ? b.frames : [])
        .slice(0, 45)
        .filter((f: any) => Array.isArray(f) && f.length === 133)
        .map((f: any[]) => ({ t: t0 + Math.max(0, Math.min(10_000, Number(f[0]) || 0)), lm: f.slice(1).map((x) => +(Number(x) || 0).toFixed(3)) }));
      const ok = await db.insertPoseStream(b.sessionId, label, rows);
      return send(res, ok ? 200 : 503, { stored: ok ? rows.length : 0 });
    }
    if (p === '/api/pose-stream/stats') {
      const st = await db.streamStats();
      return st ? send(res, 200, st) : send(res, 503, { error: 'db_unavailable' });
    }
    if (p === '/api/research/stats') {
      const rows = await db.researchStats();
      return rows ? send(res, 200, rows[0]) : send(res, 503, { error: 'db_unavailable' });
    }
    if (p === '/api/motion/stats') {
      const rows = await db.motionStats();
      return rows ? send(res, 200, { labels: rows }) : send(res, 503, { error: 'db_unavailable' });
    }
    if (p === '/api/motion/sample') {
      const rows = await db.motionSample(url.searchParams.get('label') ?? undefined, 90);
      return rows ? send(res, 200, { frames: rows }) : send(res, 503, { error: 'db_unavailable' });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('[http]', p, e);
    send(res, 500, { error: 'server error' });
  }
});

// ---------------- WebSocket ----------------

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null;
  let clientId: string | null = null;
  // Keepalive: ping every 10 s, drop only after 30 s without a pong (phones on cellular can stall for several seconds).
  let lastPong = Date.now();
  let alive = true;
  ws.on('pong', () => {
    lastPong = Date.now();
    alive = true;
  });
  const ping = setInterval(() => {
    if (Date.now() - lastPong > 30_000) {
      console.log('[ws] terminate: no pong for 30 s');
      return ws.terminate();
    }
    alive = false;
    ws.ping();
  }, 10_000);
  ws.on('message', (data) => {
    let msg: any;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg?.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
    if (msg?.type === 'join' || msg?.type === 'create') {
      const r = msg.type === 'create' ? rooms.create() : rooms.get(String(msg.room ?? ''));
      if (r && msg.type === 'create' && msg.aiFixtures === true) r.aiFixtures = true;
      if (!r) return ws.send(JSON.stringify({ type: 'error', code: 'room_not_found', message: 'No room with that code. Check the code and try again.' }));
      const res = r.join(ws, msg);
      if ('error' in res) {
        ws.send(JSON.stringify({ type: 'error', code: res.error, message: res.message }));
        return;
      }
      room = r;
      clientId = res.id;
      ws.send(JSON.stringify({ type: 'welcome', room: r.code, you: { slot: res.slot, clientId: res.id, host: r.host === res.id } }));
      ws.send(JSON.stringify(r.roster()));
      return;
    }
    if (room && clientId) room.handle(clientId, msg);
  });
  ws.on('close', (code, reason) => {
    clearInterval(ping);
    if (room) console.log(`[ws] close room=${room.code} code=${code} reason=${String(reason).slice(0, 60)} alive=${alive}`);
    if (room) room.disconnect(ws);
  });
  ws.on('error', () => {});
});

server.listen(PORT, () => console.log(`throwhands server on :${PORT}`));
