// Online rooms: lobby, WebSocket session, spectating, cheers, reconnect.
import { show, toast, nickname, myColor, beginSession, ensureCamera, backToMenu, getPose, hooks } from '../main';
import type { Session, TickResult } from '../game/session';
import type { Snapshot, SimEvent, Mode } from '../../../shared/sim';
import { packJoints } from '../../../shared/joints';
import type { GestureOutput } from '../../../shared/gestures';
import { escapeHtml, safeColor } from '../game/view';
import { playLine } from '../game/commentary';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function clientId(): string {
  let id = '';
  try {
    id = localStorage.getItem('throwhands.id') ?? '';
  } catch {}
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem('throwhands.id', id);
    } catch {}
  }
  return id;
}

interface RosterPlayer {
  slot: number;
  nickname: string;
  color: string;
  card?: string;
  connected: boolean;
  role: 'fighter' | 'spectator';
  wins: number;
}

class Conn {
  ws: WebSocket | null = null;
  room = '';
  slot = 0;
  host = false;
  roster: { mode: string; phase: string; host: number | null; queue: number[]; players: RosterPlayer[] } | null = null;
  snap: Snapshot | null = null;
  events: SimEvent[] = [];
  matchOver: { winner: number | null; elo_delta: Record<string, number>; matchId: string; sessionWins: Record<string, number> } | null = null;
  session: OnlineSession | null = null;
  private closedByUs = false;
  private reconnectUntil = 0;
  rtt = 0;
  /** Test knob: ?netlag=N adds N ms of round-trip latency (N/2 each way) to everything on this client. */
  lag = Number(new URLSearchParams(location.search).get('netlag') ?? 0) / 2;

  connect(first: { type: 'create' } | { type: 'join'; room: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      this.closedByUs = false;
      let settled = false;
      ws.onopen = () => ws.send(JSON.stringify({ ...first, clientId: clientId(), nickname: nickname(), color: myColor(), card: forgeCardName() }));
      ws.onmessage = (ev) => {
        if (this.lag) {
          setTimeout(() => handleMsg(ev), this.lag);
          return;
        }
        handleMsg(ev);
      };
      const handleMsg = (ev: MessageEvent) => {
        const m = JSON.parse(String(ev.data));
        this.onMessage(m);
        if (!settled && m.type === 'welcome') {
          settled = true;
          resolve();
        }
        if (!settled && m.type === 'error') {
          settled = true;
          reject(Object.assign(new Error(m.message), { code: m.code }));
        }
      };
      ws.onclose = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Could not reach the game server.'));
        }
        if (!this.closedByUs && this.room) this.tryReconnect();
      };
      ws.onerror = () => {};
    });
  }

  private async tryReconnect() {
    if (!this.reconnectUntil) this.reconnectUntil = Date.now() + 10_000;
    if (Date.now() > this.reconnectUntil) {
      this.reconnectUntil = 0;
      toast('Lost connection to the room.');
      backToMenu();
      return;
    }
    toast('Reconnecting…', 1200);
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await this.connect({ type: 'join', room: this.room });
      this.reconnectUntil = 0;
      toast('Reconnected!');
    } catch {
      this.tryReconnect();
    }
  }

  send(m: unknown) {
    const data = JSON.stringify(m);
    const go = () => {
      if (this.ws?.readyState === 1) this.ws.send(data);
    };
    if (this.lag) setTimeout(go, this.lag);
    else go();
  }

  close() {
    this.closedByUs = true;
    this.send({ type: 'leave' });
    this.ws?.close();
    this.ws = null;
    this.room = '';
  }

  private onMessage(m: any) {
    switch (m.type) {
      case 'welcome':
        this.room = m.room;
        this.slot = m.you.slot;
        this.host = m.you.host;
        hooks.online = { room: m.room, slot: m.you.slot };
        {
          const u = new URL(location.href);
          u.searchParams.set('room', m.room);
          history.replaceState(null, '', u.pathname + u.search);
        }
        break;
      case 'roster':
        this.roster = m;
        this.host = m.host === this.slot;
        renderLobby();
        break;
      case 'match_start':
        this.matchOver = null;
        this.events = [];
        void onMatchStart(m.mode);
        break;
      case 'snapshot':
        this.snap = m.s;
        break;
      case 'events':
        this.events.push(...m.e);
        break;
      case 'match_over':
        this.matchOver = m;
        hooks.matchOver = m;
        break;
      case 'commentary':
        playLine(m.text, m.audio ?? null, m.source);
        break;
      case 'cheer':
        showCheer(m.emoji, m.nickname);
        break;
      case 'peer_joined':
        if (m.slot !== this.slot) toast(`${m.nickname} joined`);
        break;
      case 'peer_left':
        toast(`${m.nickname} left`);
        break;
      case 'pong':
        this.rtt = performance.now() - m.t;
        break;
      case 'error':
        toast(m.message);
        break;
    }
  }
}

let conn: Conn | null = null;

function forgeCardName(): string | undefined {
  try {
    const f = JSON.parse(localStorage.getItem('throwhands.fighter') ?? 'null');
    return f?.name;
  } catch {
    return undefined;
  }
}

export async function createRoom() {
  leaveRoom();
  conn = new Conn();
  try {
    await conn.connect({ type: 'create' });
  } catch (e) {
    toast((e as Error).message);
    conn = null;
    return;
  }
  show('lobby');
  renderLobby();
}

export async function joinRoom(code: string) {
  leaveRoom();
  conn = new Conn();
  $('join-error').textContent = '';
  try {
    await conn.connect({ type: 'join', room: code });
  } catch (e) {
    const err = e as Error & { code?: string };
    conn = null;
    show('join');
    $<HTMLInputElement>('join-code').value = code;
    $('join-error').textContent = err.code === 'room_full' ? 'That room is full (8 people max).' : err.code === 'room_not_found' ? 'No room with that code. Check it and try again.' : err.message;
    hooks.errors.push('join:' + (err.code ?? err.message));
    return;
  }
  show('lobby');
  renderLobby();
}

export function leaveRoom() {
  if (conn) {
    conn.close();
    conn = null;
    hooks.online = null;
    if (location.search.includes('room=')) {
      const u = new URL(location.href);
      u.searchParams.delete('room');
      history.replaceState(null, '', u.pathname + u.search);
    }
  }
}

function roomLink() {
  return `${location.origin}/?room=${conn?.room ?? ''}`;
}

function renderLobby() {
  if (!conn || !conn.roster) return;
  const r = conn.roster;
  $('lobby-code').textContent = conn.room;
  const link = $<HTMLAnchorElement>('lobby-link');
  link.href = roomLink();
  link.textContent = roomLink().replace(/^https?:\/\//, '');
  for (const el of document.querySelectorAll<HTMLElement>('.host-only')) el.classList.toggle('hidden', !conn.host);
  const ul = $('lobby-roster');
  ul.innerHTML = '';
  const queuePos = (slot: number) => r.queue.indexOf(slot);
  for (const p of r.players) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot" style="background:${safeColor(p.color)}"></span><span>${escapeHtml(p.nickname)}${p.slot === conn.slot ? ' (you)' : ''}${p.slot === r.host ? ' 👑' : ''}</span><span class="tag"></span>`;
    const tag = li.querySelector('.tag')!;
    const parts = [] as string[];
    if (!p.connected) parts.push('reconnecting…');
    if (r.mode === 'wso' && queuePos(p.slot) >= 0) parts.push(`#${queuePos(p.slot) + 1} in line`);
    if (p.wins) parts.push(`${p.wins} win${p.wins > 1 ? 's' : ''}`);
    if (r.phase !== 'lobby') parts.push(p.role);
    tag.textContent = parts.join(' · ');
    ul.appendChild(li);
  }
  const n = r.players.length;
  $('lobby-status').textContent = conn.host ? (n < 2 ? 'Waiting for a friend… you can also start now and fight a bot.' : `${n} in the room. Pick a mode and start!`) : 'Waiting for the host to start…';
  const radios = document.querySelectorAll<HTMLInputElement>('input[name=mode]');
  radios.forEach((x) => (x.checked = x.value === r.mode || (r.mode === 'duel' && x.value === 'duel' && !document.querySelector('input[name=mode]:checked'))));
}

$('lobby-start').onclick = () => {
  const mode = (document.querySelector<HTMLInputElement>('input[name=mode]:checked')?.value ?? 'duel') as 'duel' | 'brawl' | 'wso';
  const q = new URLSearchParams(location.search);
  conn?.send({ type: 'start', mode, ...(q.has('roundsecs') ? { roundSeconds: Number(q.get('roundsecs')) } : {}), ...(q.has('bots') ? { bots: Number(q.get('bots')) } : {}) });
};
$('lobby-leave').onclick = () => backToMenu();
$('lobby-copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(roomLink());
    toast('Link copied!');
  } catch {
    toast(roomLink(), 5000);
  }
};
$('lobby-share').onclick = async () => {
  const data = { title: 'Throw Hands', text: `Fight me in Throw Hands! Room ${conn?.room}`, url: roomLink() };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch {}
  }
  $('lobby-copy').click();
};

async function onMatchStart(mode: string) {
  if (!conn) return;
  const me = conn.snap?.f.find((f) => f.id === conn!.slot);
  const fighter = conn.roster?.players.find((p) => p.slot === conn!.slot)?.role === 'fighter' || !!me;
  // Wait briefly for the roster that marks roles.
  await new Promise((r) => setTimeout(r, 150));
  const isFighter = conn.roster?.players.find((p) => p.slot === conn!.slot)?.role === 'fighter' || fighter;
  if (isFighter) {
    const ok = await ensureCamera(1);
    if (!ok) return;
  }
  const s = new OnlineSession(conn, isFighter ? [conn.slot] : [], mode === 'brawl' ? 'brawl' : 'duel');
  conn.session = s;
  beginSession(s, isFighter ? (mode === 'brawl' ? 'wide' : 'behind') : mode === 'brawl' ? 'wide' : 'side', 'online-' + mode);
  setupCheers(!isFighter);
}

function setupCheers(spectator: boolean) {
  let bar = document.getElementById('cheer-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cheer-bar';
    bar.style.cssText = 'position:absolute;bottom:60px;right:12px;display:flex;gap:6px;pointer-events:auto';
    for (const e of ['🔥', '👏', '😂', '💥', '😱', '🥊']) {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = e;
      b.dataset.cheer = e;
      b.onclick = () => conn?.send({ type: 'cheer', emoji: e });
      bar.appendChild(b);
    }
    $('hud').appendChild(bar);
  }
  bar.classList.toggle('hidden', !spectator);
}

function showCheer(emoji: string, who: string) {
  const el = document.createElement('div');
  el.className = 'cheer';
  el.textContent = emoji;
  el.title = who;
  el.style.left = 10 + Math.random() * 80 + '%';
  $('cheers').appendChild(el);
  hooks.cheers = (hooks.cheers ?? 0) + 1;
  setTimeout(() => el.remove(), 2500);
}

export class OnlineSession implements Session {
  kind = 'online' as const;
  private lastSend = 0;
  private started = false;
  private pingTimer: number;
  constructor(
    private c: Conn,
    public localIds: number[],
    public mode: Mode,
  ) {
    this.pingTimer = window.setInterval(() => c.send({ type: 'ping', t: performance.now() }), 2000);
  }
  get over() {
    return !!this.c.matchOver;
  }
  start() {
    this.started = true;
  }
  input(_player: number, g: GestureOutput, actions: GestureOutput['actions']) {
    if (!this.localIds.length) return;
    for (const a of actions) this.c.send({ type: 'action', t: Date.now(), kind: a.kind, hand: a.hand, speed: +a.speed.toFixed(2) });
    const now = performance.now();
    if (now - this.lastSend >= 50 || actions.length) {
      this.lastSend = now;
      this.c.send({ type: 'state', t: Date.now(), pose: g.joints ? packJoints(g.joints) : undefined, blocking: g.blocking, xshield: g.xshield, move: g.move.map((v) => +v.toFixed(2)), turn: g.turn, present: g.present && this.started });
    }
  }
  tick(): TickResult | null {
    if (!this.c.snap) return null;
    const events = this.c.events;
    this.c.events = [];
    return { snap: this.c.snap, events };
  }
  rematch() {
    this.c.matchOver = null;
    this.c.send({ type: 'rematch' });
  }
  dispose() {
    clearInterval(this.pingTimer);
  }
  get eloDelta() {
    return this.c.matchOver?.elo_delta ?? null;
  }
  get matchId() {
    return this.c.matchOver?.matchId ?? '';
  }
  get isHost() {
    return this.c.host;
  }
}

export function currentConn() {
  return conn;
}
void getPose;
