// Online rooms: WebSocket relay with an authoritative server-side simulation.
// Every message carries player slot ids; rooms hold any number of clients (fighters, bots, spectators).
import type { WebSocket } from 'ws';
import { Sim, type Mode, type SimEvent, type ActionKind, type Hand } from '../shared/sim';
import { Bot } from '../shared/bot';
import { eloUpdate } from '../shared/elo';
import { summarize } from '../shared/commentary';

export const MAX_PEOPLE = 8;
const RECONNECT_GRACE_MS = 10_000;
const TICK_HZ = 30;
const SNAP_HZ = 20;
const BOT_NAMES = ['Iron Rook', 'Neon Viper', 'Captain Comet', 'Ghost Ninja', 'Lava King', 'Storm Queen', 'Volt Kid', 'Titan Mk II'];
const COLORS = ['#ff3d6e', '#33b5ff', '#ffc53d', '#3dff9a', '#b03dff', '#ff7a3d', '#3dfff0', '#f5f5f5'];
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion

export type RoomMode = 'duel' | 'brawl' | 'wso';

export interface Hooks {
  rivalry?: (input: { matchId: string; a: string; b: string; scoreA: number; scoreB: number; winner: string | null; highlights: string }, room: Room) => Promise<unknown>;
  commentary?: (summary: string, voice: boolean, room: Room) => Promise<{ text: string; audio: string | null; source: string } | null>;
  onMatchOver?: (room: Room, info: MatchSummary) => Promise<Record<string, number> | void>;
  onEvents?: (room: Room, events: SimEvent[]) => void;
}

export interface MatchSummary {
  matchId: string;
  mode: RoomMode;
  startedAt: Date;
  endedAt: Date;
  winnerClient: string | null;
  fighters: { clientId: string | null; slot: number; nickname: string; bot: boolean; kos: number; damage: number; fastestPunch: number }[];
}

interface Client {
  id: string; // stable client id (survives reconnects), also the player id for Elo
  ws: WebSocket | null;
  slot: number;
  nickname: string;
  color: string;
  card?: string;
  connected: boolean;
  disconnectedAt: number;
  joinedAt: number;
}

export function sanitizeName(s: unknown, fallback = 'Player'): string {
  const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return t || fallback;
}
export function sanitizeColor(s: unknown): string | null {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s) ? s : null;
}

export class Room {
  code: string;
  clients = new Map<string, Client>();
  host: string | null = null;
  mode: RoomMode = 'duel';
  sim: Sim | null = null;
  bots: Bot[] = [];
  /** client ids in the fight (sim fighters by slot), and the winner-stays-on queue */
  fighters: string[] = [];
  queue: string[] = [];
  sessionWins: Record<string, number> = {};
  matchId = '';
  matchStartedAt = new Date();
  private nextSlot = 1;
  private tickTimer: NodeJS.Timeout | null = null;
  private snapCounter = 0;
  private matchOverHandled = false;
  private nextMatchTimer: NodeJS.Timeout | null = null;
  lastActivity = Date.now();
  /** Test rooms (?aifixture): recorded AI responses instead of live Meta/Gemini calls (spec 10 test budget). */
  aiFixtures = false;
  private commentBuf: SimEvent[] = [];
  matchHighlights: string[] = [];
  private lastComment = 0;
  private commentCount = 0;
  private commentInflight = false;

  constructor(code: string, private hooks: Hooks) {
    this.code = code;
  }

  get people() {
    return [...this.clients.values()];
  }

  // ---------- membership ----------

  join(ws: WebSocket, msg: { clientId?: string; nickname?: string; color?: string; card?: string }): Client | { error: string; message: string } {
    const id = typeof msg.clientId === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(msg.clientId) ? msg.clientId : crypto.randomUUID();
    const existing = this.clients.get(id);
    if (existing) {
      // Reconnect: take over the old slot.
      try {
        existing.ws?.close(4000, 'replaced');
      } catch {}
      existing.ws = ws;
      existing.connected = true;
      existing.disconnectedAt = 0;
      if (msg.nickname) existing.nickname = sanitizeName(msg.nickname, existing.nickname);
      this.broadcastRoster();
      return existing;
    }
    const connectedCount = this.people.length;
    if (connectedCount >= MAX_PEOPLE) return { error: 'room_full', message: `This room is full (${MAX_PEOPLE} people max).` };
    const slot = this.nextSlot++;
    const c: Client = {
      id,
      ws,
      slot,
      nickname: sanitizeName(msg.nickname),
      color: sanitizeColor(msg.color) ?? COLORS[(slot - 1) % COLORS.length],
      card: typeof msg.card === 'string' ? msg.card.slice(0, 200) : undefined,
      connected: true,
      disconnectedAt: 0,
      joinedAt: Date.now(),
    };
    this.clients.set(id, c);
    if (!this.host) this.host = id;
    this.queue.push(id);
    this.broadcast({ type: 'peer_joined', slot: c.slot, nickname: c.nickname });
    this.broadcastRoster();
    // Joining while a match is running: enter it as a spectator.
    if (this.sim && this.sim.phase !== 'match_over') {
      const sim = this.sim;
      setTimeout(() => this.sendTo(id, { type: 'match_start', mode: this.mode, matchId: this.matchId, fighters: sim.fighters.map((f) => ({ slot: f.id, name: f.name, color: f.color, bot: f.bot, card: f.card })) }), 50);
    }
    return c;
  }

  disconnect(ws: WebSocket) {
    for (const c of this.clients.values()) {
      if (c.ws === ws) {
        c.connected = false;
        c.ws = null;
        c.disconnectedAt = Date.now();
        if (this.sim) this.sim.setInput(c.slot, { present: false });
        this.broadcastRoster();
      }
    }
  }

  leave(id: string) {
    const c = this.clients.get(id);
    if (!c) return;
    this.clients.delete(id);
    this.queue = this.queue.filter((q) => q !== id);
    this.broadcast({ type: 'peer_left', slot: c.slot, nickname: c.nickname });
    // Pass the slot explicitly: the client is already removed from the map.
    this.onFighterGone(id, c.slot);
    if (this.host === id) this.host = this.people.find((p) => p.connected)?.id ?? this.people[0]?.id ?? null;
    this.broadcastRoster();
  }

  /** Called every second: expire disconnected clients after the grace period. */
  housekeeping(now: number) {
    for (const c of [...this.clients.values()]) {
      if (!c.connected && now - c.disconnectedAt > RECONNECT_GRACE_MS) this.leave(c.id);
    }
    if (this.host) {
      const h = this.clients.get(this.host);
      if (h && !h.connected && now - h.disconnectedAt > RECONNECT_GRACE_MS) {
        this.host = this.people.find((p) => p.connected)?.id ?? null;
        this.broadcastRoster();
      }
    }
  }

  private onFighterGone(id: string, slot: number) {
    if (!this.sim || !this.fighters.includes(id)) return;
    const slotIdx = this.fighters.indexOf(id);
    const client: number | null = slot;
    if (this.sim.cfg.mode === 'brawl') {
      // Replace with a bot so the brawl keeps its numbers.
      const f = client != null ? this.sim.get(client) : undefined;
      if (f) {
        f.bot = true;
        f.name = f.name + ' (bot)';
        this.bots.push(new Bot(f.id, { level: 1, seed: f.id * 97 }));
      }
      this.fighters[slotIdx] = '';
      return;
    }
    // Duel / winner-stays-on: the remaining fighter wins.
    const other = this.fighters.find((f) => f && f !== id);
    const winnerSlot = other ? this.slotOf(other) : null;
    if (client != null) this.sim.removeFighter(client);
    if (this.sim.phase !== 'match_over') this.sim.endMatch(winnerSlot ?? null, 'opponent_left');
    this.fighters[slotIdx] = '';
  }

  private slotOf(id: string): number | null {
    return this.clients.get(id)?.slot ?? null;
  }

  // ---------- match flow ----------

  roundSeconds: number | undefined;
  start(by: string, mode: RoomMode, botFill?: number, roundSeconds?: number) {
    if (by !== this.host) return this.sendTo(by, { type: 'error', code: 'not_host', message: 'Only the host can start.' });
    this.mode = mode;
    this.roundSeconds = roundSeconds;
    this.startMatch(botFill);
  }

  private startMatch(botFill?: number) {
    this.stopTick();
    if (this.nextMatchTimer) clearTimeout(this.nextMatchTimer);
    const people = this.people.filter((p) => p.connected || Date.now() - p.disconnectedAt < RECONNECT_GRACE_MS);
    const simMode: Mode = this.mode === 'brawl' ? 'brawl' : 'duel';
    const sim = new Sim({ mode: simMode, ...(this.roundSeconds ? { roundSeconds: this.roundSeconds } : {}) }, (Math.random() * 1e9) | 0);
    this.bots = [];
    this.fighters = [];
    let chosen: Client[];
    if (this.mode === 'brawl') chosen = people.slice(0, MAX_PEOPLE);
    else if (this.mode === 'wso') {
      this.queue = this.queue.filter((q) => this.clients.has(q));
      chosen = this.queue.slice(0, 2).map((id) => this.clients.get(id)!).filter(Boolean);
    } else chosen = people.slice(0, 2);
    for (const c of chosen) {
      sim.addFighter({ id: c.slot, name: c.nickname, color: c.color, card: c.card });
      this.fighters.push(c.id);
    }
    // Bots: Brawl fills to botFill (default 6); a lone duelist gets one bot.
    const wantTotal = this.mode === 'brawl' ? Math.min(MAX_PEOPLE, Math.max(chosen.length, botFill ?? 6)) : chosen.length < 2 ? 2 : chosen.length;
    let b = 0;
    while (sim.fighters.length < wantTotal) {
      const id = 100 + b;
      sim.addFighter({ id, name: BOT_NAMES[b % BOT_NAMES.length], color: COLORS[(id + 3) % COLORS.length], bot: true });
      this.bots.push(new Bot(id, { level: 1, seed: id * 31 + b }));
      b++;
    }
    this.sim = sim;
    this.matchId = crypto.randomUUID();
    this.matchStartedAt = new Date();
    this.matchOverHandled = false;
    this.matchHighlights = [];
    sim.start();
    this.broadcastRoster();
    this.broadcast({ type: 'match_start', mode: this.mode, matchId: this.matchId, fighters: sim.fighters.map((f) => ({ slot: f.id, name: f.name, color: f.color, bot: f.bot, card: f.card })) });
    this.startTick();
  }

  rematch(by: string) {
    if (by !== this.host) return;
    this.startMatch();
  }

  private startTick() {
    let last = performance.now();
    this.tickTimer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.tick(dt);
    }, 1000 / TICK_HZ);
  }

  stopTick() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private tick(dt: number) {
    const sim = this.sim;
    if (!sim) return;
    for (const b of this.bots) b.tick(sim);
    sim.step(dt);
    const events = sim.drainEvents();
    for (const b of this.bots) b.observe(events, sim);
    if (events.length) {
      this.broadcast({ type: 'events', e: events });
      for (const e of events) {
        if (e.type === 'hit') this.broadcast({ type: 'hit', target: e.target, attacker: e.attacker, damage: e.damage, kind: e.kind, blocked: e.blocked });
        if (e.type === 'round_end' || e.type === 'round_start') {
          const hp: Record<number, number> = {};
          for (const f of sim.fighters) hp[f.id] = f.hp;
          this.broadcast({ type: 'round', n: sim.round, hp, timer: sim.roundTimer });
        }
      }
      this.hooks.onEvents?.(this, events);
      for (const e of events) if (e.type !== 'whiff' && e.type !== 'super_denied' && e.type !== 'respawn') this.commentBuf.push(e);
      for (const e of events) {
        const nm = (id: number | null) => sim.get(id ?? -1)?.name ?? 'someone';
        if (e.type === 'super') this.matchHighlights.push(`${nm(e.id)} super ${e.kind}`);
        if (e.type === 'ko') this.matchHighlights.push(`${nm(e.attacker)} KO'd ${nm(e.target)} with ${e.kind}`);
      }
    }
    this.maybeComment();
    this.snapCounter += SNAP_HZ / TICK_HZ;
    if (this.snapCounter >= 1) {
      this.snapCounter -= 1;
      this.broadcast({ type: 'snapshot', s: sim.snapshot(true) });
    }
    if (sim.phase === 'match_over' && !this.matchOverHandled) {
      this.matchOverHandled = true;
      void this.handleMatchOver();
    }
  }

  /** One shared commentary line for the whole room every ~3.5 s (saves API quota, everyone hears the same call). */
  private maybeComment() {
    const sim = this.sim;
    if (!sim || !this.hooks.commentary || this.commentInflight || !this.commentBuf.length) return;
    const now = Date.now();
    if (now - this.lastComment < 3500) return;
    if (sim.phase !== 'fight' && !this.commentBuf.some((e) => e.type === 'ko' || e.type === 'match_over')) return;
    this.lastComment = now;
    const summary = summarize(this.commentBuf, sim.snapshot(false));
    this.commentBuf = [];
    this.commentInflight = true;
    // Spoken audio on every other line keeps TTS within the free-tier budget; clients use the browser voice otherwise.
    const voice = this.commentCount++ % 2 === 0;
    this.hooks
      .commentary(summary, voice, this)
      .then((c) => {
        if (c) this.broadcast({ type: 'commentary', text: c.text, audio: c.audio, source: c.source });
      })
      .catch(() => {})
      .finally(() => (this.commentInflight = false));
  }

  private async handleMatchOver() {
    const sim = this.sim!;
    const winnerSlot = sim.winner;
    const winnerClient = winnerSlot != null ? this.people.find((p) => p.slot === winnerSlot)?.id ?? null : null;
    if (winnerClient) this.sessionWins[winnerClient] = (this.sessionWins[winnerClient] ?? 0) + 1;
    const summary: MatchSummary = {
      matchId: this.matchId,
      mode: this.mode,
      startedAt: this.matchStartedAt,
      endedAt: new Date(),
      winnerClient,
      fighters: sim.fighters.map((f) => ({
        clientId: this.people.find((p) => p.slot === f.id)?.id ?? null,
        slot: f.id,
        nickname: f.name,
        bot: f.bot,
        kos: f.kos,
        damage: f.damageDealt,
        fastestPunch: f.fastestPunch,
      })),
    };
    let eloDelta: Record<string, number> = {};
    // Local Elo math is always available; the DB hook stores it (fails soft).
    const humans = summary.fighters.filter((f) => !f.bot && f.clientId);
    try {
      const res = await this.hooks.onMatchOver?.(this, summary);
      if (res) eloDelta = res;
    } catch (e) {
      console.error('match over hook failed', e);
    }
    if (!Object.keys(eloDelta).length && humans.length === 2 && winnerClient) {
      const [a, b] = humans;
      const d = eloUpdate(1000, 1000, winnerClient === a.clientId ? 1 : 0);
      eloDelta = { [a.slot]: d.deltaA, [b.slot]: d.deltaB };
    }
    this.broadcast({ type: 'match_over', winner: winnerSlot, elo_delta: eloDelta, matchId: this.matchId, sessionWins: this.sessionWinsBySlot() });
    // Rivalry card for two-human matches: generated once on the server and broadcast to the whole room.
    const humanF = sim.fighters.filter((f) => !f.bot);
    if (this.hooks.rivalry && humanF.length === 2 && sim.cfg.mode === 'duel') {
      const [fa, fb] = humanF;
      const matchId = this.matchId;
      const highlights = this.matchHighlights.slice(-6).join('; ');
      this.hooks
        .rivalry({ matchId, a: fa.name, b: fb.name, scoreA: fa.roundWins, scoreB: fb.roundWins, winner: winnerSlot === fa.id ? fa.name : winnerSlot === fb.id ? fb.name : null, highlights }, this)
        .then((card) => this.broadcast({ type: 'rivalry', matchId, card }))
        .catch(() => this.broadcast({ type: 'rivalry', matchId, card: null }));
    }
    if (this.mode === 'wso') {
      // Loser goes to the back of the queue; winner stays on. Next match in 6 s.
      const loser = this.fighters.find((f) => f && f !== winnerClient);
      this.queue = this.queue.filter((q) => q !== loser && this.clients.has(q));
      if (winnerClient) {
        this.queue = [winnerClient, ...this.queue.filter((q) => q !== winnerClient)];
      }
      if (loser && this.clients.has(loser)) this.queue.push(loser);
      this.broadcastRoster();
      this.nextMatchTimer = setTimeout(() => {
        if (this.clients.size >= 1) this.startMatch();
      }, 6000);
    }
  }

  private sessionWinsBySlot() {
    const out: Record<number, number> = {};
    for (const [id, w] of Object.entries(this.sessionWins)) {
      const c = this.clients.get(id);
      if (c) out[c.slot] = w;
    }
    return out;
  }

  // ---------- inputs ----------

  handle(clientId: string, msg: any) {
    const c = this.clients.get(clientId);
    if (!c) return;
    this.lastActivity = Date.now();
    switch (msg.type) {
      case 'state': {
        if (!this.sim || !this.fighters.includes(clientId)) return;
        const move = Array.isArray(msg.move) ? [clamp(msg.move[0]), clamp(msg.move[1])] as [number, number] : [0, 0] as [number, number];
        const pose = Array.isArray(msg.pose) && msg.pose.length <= 64 ? msg.pose.map((v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(v) : 0)) : undefined;
        this.sim.setInput(c.slot, { move, blocking: !!msg.blocking, xshield: !!msg.xshield, turn: msg.turn === 1 ? 1 : msg.turn === -1 ? -1 : 0, present: !!msg.present, joints: pose });
        break;
      }
      case 'action': {
        if (!this.sim || !this.fighters.includes(clientId)) return;
        const kinds: ActionKind[] = ['jab', 'hook', 'uppercut', 'kick', 'palm', 'xshield'];
        if (!kinds.includes(msg.kind)) return;
        const hand: Hand = msg.hand === 'L' || msg.hand === 'R' ? msg.hand : 'B';
        const speed = Math.max(0, Math.min(12, Number(msg.speed) || 0));
        this.sim.pushAction(c.slot, { kind: msg.kind, hand, speed });
        break;
      }
      case 'start':
        this.start(clientId, ['duel', 'brawl', 'wso'].includes(msg.mode) ? msg.mode : 'duel', typeof msg.bots === 'number' ? Math.max(1, Math.min(8, msg.bots)) : undefined, typeof msg.roundSeconds === 'number' ? Math.max(10, Math.min(120, msg.roundSeconds)) : undefined);
        break;
      case 'rematch':
        this.rematch(clientId);
        break;
      case 'cheer': {
        const emoji = ['🔥', '👏', '😂', '💥', '😱', '🥊'].includes(msg.emoji) ? msg.emoji : '👏';
        this.broadcast({ type: 'cheer', slot: c.slot, nickname: c.nickname, emoji });
        break;
      }
      case 'profile': {
        if (msg.nickname) c.nickname = sanitizeName(msg.nickname, c.nickname);
        const col = sanitizeColor(msg.color);
        if (col) c.color = col;
        if (typeof msg.card === 'string') c.card = msg.card.slice(0, 200);
        this.broadcastRoster();
        break;
      }
      case 'leave':
        this.leave(clientId);
        break;
    }
  }

  // ---------- output ----------

  roster() {
    const fighting = new Set(this.fighters.filter(Boolean));
    return {
      type: 'roster',
      room: this.code,
      mode: this.mode,
      phase: this.sim?.phase ?? 'lobby',
      host: this.host ? this.clients.get(this.host)?.slot ?? null : null,
      queue: this.queue.map((q) => this.clients.get(q)?.slot).filter((s) => s != null),
      players: this.people.map((p) => ({
        slot: p.slot,
        nickname: p.nickname,
        color: p.color,
        card: p.card,
        connected: p.connected,
        role: fighting.has(p.id) ? 'fighter' : 'spectator',
        wins: this.sessionWins[p.id] ?? 0,
      })),
    };
  }

  broadcastRoster() {
    this.broadcast(this.roster());
  }

  broadcast(msg: unknown) {
    const data = JSON.stringify(msg);
    for (const c of this.clients.values()) if (c.ws && c.ws.readyState === 1) c.ws.send(data);
  }

  sendTo(id: string, msg: unknown) {
    const c = this.clients.get(id);
    if (c?.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  }

  dispose() {
    this.stopTick();
    if (this.nextMatchTimer) clearTimeout(this.nextMatchTimer);
  }
}

function clamp(v: unknown) {
  const n = Number(v);
  return isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
}

export class RoomManager {
  rooms = new Map<string, Room>();
  constructor(private hooks: Hooks) {
    setInterval(() => this.housekeeping(), 1000).unref();
  }

  create(): Room {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
    } while (this.rooms.has(code));
    const r = new Room(code, this.hooks);
    this.rooms.set(code, r);
    return r;
  }

  get(code: string) {
    return this.rooms.get(String(code).toUpperCase());
  }

  private housekeeping() {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      r.housekeeping(now);
      if (r.clients.size === 0 && now - r.lastActivity > 60_000) {
        r.dispose();
        this.rooms.delete(code);
      } else if (r.clients.size === 0) {
        r.stopTick();
      }
    }
  }
}
