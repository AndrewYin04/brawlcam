// App controller: screens, camera, calibration, game loop.
import { Arena } from './game/arena';
import { MatchView } from './game/view';
import { preloadModel, FighterAvatar } from './game/avatar';
import { LocalSession, FIGHTER_COLORS, type Session } from './game/session';
import { PoseInput } from './input/players';
import { startCamera, CameraFailure } from './input/camera';
import * as sfx from './game/audio';
import type { SimEvent } from '../../shared/sim';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
if (params.has('clean')) document.body.classList.add('clean');

type Screen = 'loading' | 'menu' | 'camera' | 'join' | 'lobby' | 'results' | 'page' | 'game';

// ---------- test/debug hooks ----------
export const hooks = {
  screen: 'loading' as Screen,
  mode: '',
  delegate: '',
  poseFps: 0,
  renderFps: 0,
  events: [] as { t: number; type: string; [k: string]: unknown }[],
  localActions: [] as { t: number; kind: string; hand: string; player: number }[],
  calibrated: false,
  snapshot: null as unknown,
  errors: [] as string[],
  lastGesture: [] as unknown[],
  online: null as null | { room: string; slot: number },
  matchOver: null as unknown,
  cheers: 0,
  rivalry: null as unknown,
  /** Recent distinct snapshots with local arrival time (epoch ms), for sync assertions in tests. */
  snapLog: [] as { t: number; at: number; round: number; timer: number; phase: string; hp: number[] }[],
};
(window as any).__brawl = hooks;
window.addEventListener('error', (e) => hooks.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => hooks.errors.push(String((e as PromiseRejectionEvent).reason)));

// ---------- state ----------
FighterAvatar.lowGfx = params.has('lowgfx');
const arena = new Arena($<HTMLCanvasElement>('game'), 4.2, isMobile, params.has('lowgfx'));
window.addEventListener('resize', () => arena.resize());
let view: MatchView | null = null;
let session: Session | null = null;
let pose: PoseInput | null = null;
let cameraOk = false;
let pendingStart: (() => void) | null = null;
let calibrating = false;
let resultsShown = false;
let loopStarted = false;
let resultsTimer = 0;

export function show(screen: Screen) {
  hooks.screen = screen;
  for (const el of document.querySelectorAll<HTMLElement>('.screen')) el.classList.remove('active');
  const el = document.getElementById('screen-' + screen);
  if (el) el.classList.add('active');
  $('hud').classList.toggle('hidden', !(screen === 'game' || screen === 'results'));
}

export function toast(msg: string, ms = 2500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

export function nickname(): string {
  let n = '';
  try {
    n = localStorage.getItem('brawlcam.nick') ?? '';
  } catch {}
  return n || 'Player';
}

// ---------- loading ----------
async function boot() {
  const bar = $('load-bar');
  let modelFrac = 0;
  let poseFrac = 0;
  const upd = () => (bar.style.width = `${Math.round((modelFrac * 0.5 + poseFrac * 0.5) * 100)}%`);
  const poseModel = (async () => {
    const res = await fetch('/models/pose_landmarker_lite.task');
    const total = Number(res.headers.get('content-length') ?? 0) || 5_800_000;
    const reader = res.body!.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      poseFrac = Math.min(1, got / total);
      upd();
    }
  })();
  try {
    await Promise.all([preloadModel((f) => ((modelFrac = f), upd())), poseModel]);
  } catch (e) {
    $('load-text').textContent = 'Loading failed. Check your connection and reload.';
    hooks.errors.push('boot: ' + e);
    return;
  }
  // Idle arena behind the menu
  idleArena();
  const nickInput = $<HTMLInputElement>('nickname');
  nickInput.value = nickname() === 'Player' ? '' : nickname();
  nickInput.addEventListener('change', () => {
    try {
      localStorage.setItem('brawlcam.nick', nickInput.value.trim().slice(0, 16));
    } catch {}
  });
  show('menu');
  startLoop();
  const auto = params.get('mode');
  const room = params.get('room');
  if (room) import('./net/online').then((m) => m.joinRoom(room.toUpperCase()));
  else if (auto) startMode(auto);
}

function idleArena() {
  if (view) return;
  // A bot-vs-bot exhibition behind the menu.
  session = new LocalSession('duel', [], 2, 1);
  view = new MatchView(arena, { localIds: [], localJoints: () => null, camera: 'side' });
  session.start();
  hooks.mode = 'idle';
}

// ---------- camera + pose ----------
async function ensureCamera(players: number): Promise<boolean> {
  const video = $<HTMLVideoElement>('cam');
  if (!cameraOk) {
    try {
      await startCamera(video, isMobile);
      cameraOk = true;
    } catch (e) {
      const f = e instanceof CameraFailure ? e : new CameraFailure('unknown', String(e));
      showCameraProblem(f);
      return false;
    }
  }
  if (!pose) {
    pose = new PoseInput(players);
    pose.skeleton = $<HTMLCanvasElement>('skeleton').getContext('2d');
    try {
      hooks.delegate = await pose.init(params.has('cpu'));
    } catch (e) {
      showCameraProblem(new CameraFailure('unknown', 'The pose model failed to start: ' + (e as Error).message));
      pose = null;
      return false;
    }
    pose.start(video);
  } else if (pose.players !== players) pose.setPlayers(players);
  return true;
}

function showCameraProblem(f: CameraFailure) {
  hooks.errors.push('camera:' + f.kind);
  $('cam-title').textContent = f.kind === 'denied' ? 'Camera blocked' : f.kind === 'nodevice' ? 'No camera found' : f.kind === 'insecure' ? 'HTTPS needed' : 'Camera problem';
  $('cam-msg').textContent = f.message;
  show('camera');
}

// ---------- modes ----------
let lastMode = 'practice';

export async function startMode(mode: string) {
  sfx.audioResume();
  lastMode = mode;
  if (mode === 'online-create') return (await import('./net/online')).createRoom();
  if (mode === 'online-join') return show('join');
  if (mode === 'forge') return (await import('./pages/forge')).showForge();
  if (mode === 'store') return (await import('./pages/store')).showStore();
  if (mode === 'leaderboard') return (await import('./pages/leaderboard')).showLeaderboard();
  const demo = mode === 'demo';
  const players = mode === 'local2p' ? 2 : 1;
  if (!demo) {
    pendingStart = () => startMode(mode);
    if (!(await ensureCamera(players))) return;
  }
  const me = { name: nickname(), color: myColor() };
  if (mode === 'practice' || demo) {
    beginLocal(new LocalSession('duel', [demo ? { ...me, name: 'Demo Fighter' } : me], 1, Number(params.get('botlevel') ?? 1), demo ? [0] : []), demo ? 'side' : 'behind', mode);
  } else if (mode === 'local2p') {
    beginLocal(new LocalSession('duel', [{ name: 'Player 1', color: FIGHTER_COLORS[0] }, { name: 'Player 2', color: FIGHTER_COLORS[1] }], 0), 'side', mode);
  } else if (mode === 'brawl') {
    beginLocal(new LocalSession('brawl', [me], Number(params.get('bots') ?? 5), 1), 'wide', mode);
  }
}

export function myColor(): string {
  try {
    const c = localStorage.getItem('brawlcam.color');
    if (c && /^#[0-9a-f]{6}$/i.test(c)) return c;
  } catch {}
  return FIGHTER_COLORS[0];
}

function teardown() {
  session?.dispose();
  view?.dispose();
  session = null;
  view = null;
}

export function beginSession(s: Session, camera: 'behind' | 'side' | 'wide', mode: string, skipCalibration = false) {
  teardown();
  resultsShown = false;
  hooks.mode = mode;
  hooks.events = [];
  hooks.localActions = [];
  session = s;
  view = new MatchView(arena, {
    localIds: s.localIds,
    localJoints: (id) => {
      const i = s.localIds.indexOf(id);
      return i >= 0 && pose ? pose.latest[i]?.joints ?? null : null;
    },
    camera,
  });
  show('game');
  const needCal = pose && !skipCalibration && !params.has('skipcal') && s.localIds.length > 0 && !pose.recognizers.every((r) => r.calibrated);
  if (needCal) runCalibration(() => s.start());
  else s.start();
}

function beginLocal(s: LocalSession, camera: 'behind' | 'side' | 'wide', mode: string) {
  beginSession(s, camera, mode, mode === 'demo');
}

function runCalibration(done: () => void) {
  calibrating = true;
  pose!.recognizers.forEach((r) => r.beginCalibration());
  $('calib').classList.remove('hidden');
  $('calib-title').textContent = pose!.players > 1 ? 'Both players: get in your guard' : 'Get in your guard';
  const arc = $('calib-arc');
  const finish = () => {
    calibrating = false;
    hooks.calibrated = true;
    $('calib').classList.add('hidden');
    pose!.recognizers.forEach((r) => {
      if (!r.calibrated) r.skipCalibration();
    });
    done();
  };
  $('calib-skip').onclick = finish;
  pose!.onUpdate = () => {
    if (!calibrating) return;
    const outs = pose!.latest;
    let minProg = 1;
    let guidance: string | null = null;
    outs.forEach((o, i) => {
      const c = o.calibrating;
      const prog = pose!.recognizers[i].calibrated ? 1 : c?.progress ?? 0;
      minProg = Math.min(minProg, prog);
      if (!o.present) guidance = pose!.players > 1 ? `Player ${i + 1}: step into the frame` : 'Step into the frame so the camera can see you';
      else if (c?.guidance && !guidance) guidance = (pose!.players > 1 ? `Player ${i + 1}: ` : '') + c.guidance;
    });
    arc.style.strokeDashoffset = String(276.5 * (1 - minProg));
    const msg = $('calib-msg');
    msg.textContent = guidance ?? 'Hold it…';
    msg.classList.toggle('warn', !!guidance);
    if (pose!.recognizers.every((r) => r.calibrated)) finish();
  };
}

function showResults() {
  if (!session || !view || resultsShown) return;
  resultsShown = true;
  const snap = view.snap!;
  const winner = snap.winner;
  const mine = session.localIds;
  const brawl = snap.f.length > 2;
  let title = 'K.O.!';
  if (winner == null) title = 'DRAW';
  else if (mine.length === 1) title = mine.includes(winner) ? 'YOU WIN!' : 'YOU LOSE';
  else title = `${view.name(winner)} WINS!`;
  $('res-title').textContent = title;
  $('res-sub').textContent = brawl ? 'Most KOs wins the brawl.' : winner != null ? `${view.name(winner)} takes the match.` : 'Nobody could finish it.';
  const stats = $('res-stats');
  stats.innerHTML = '';
  for (const f of snap.f.filter((f) => !brawl || mine.includes(f.id) || f.id === winner).slice(0, 4)) {
    const d = document.createElement('div');
    d.innerHTML = `<b></b><span></span>`;
    d.querySelector('b')!.textContent = brawl ? `${f.kos} KOs` : `${f.rw} rounds`;
    d.querySelector('span')!.textContent = f.name;
    stats.appendChild(d);
  }
  // Online extras: Elo change, rivalry card, host-only rematch.
  const online = session.kind === 'online' ? (session as any) : null;
  $('res-share').classList.add('hidden');
  $('res-card').classList.add('hidden');
  $('res-rematch').textContent = 'Rematch';
  ($('res-rematch') as HTMLButtonElement).disabled = false;
  if (online) {
    const d = online.eloDelta?.[String(mine[0])];
    if (typeof d === 'number') $('res-sub').textContent += ` Elo ${d >= 0 ? '+' : ''}${d}.`;
    if (!online.isHost) {
      $('res-rematch').textContent = 'Waiting for host…';
      ($('res-rematch') as HTMLButtonElement).disabled = true;
    }
    const humans = snap.f.filter((f) => !f.bot);
    if (humans.length === 2 && !brawl) void makeRivalryCard(online.matchId, humans[0], humans[1], winner);
  }
  show('results');
}

async function makeRivalryCard(matchId: string, a: { name: string; rw: number; id: number }, b: { name: string; rw: number; id: number }, winner: number | null) {
  const box = $('res-card');
  box.classList.remove('hidden');
  box.innerHTML = '<p class="muted">Making your rivalry card…</p>';
  const highlights = hooks.events.filter((e) => e.type === 'super' || e.type === 'ko').slice(-6).map((e) => `${e.type} by slot ${(e as any).id ?? (e as any).attacker}`).join('; ');
  let card: any = null;
  try {
    const r = await fetch('/api/rivalry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ matchId, a: a.name, b: b.name, scoreA: a.rw, scoreB: b.rw, winner: winner === a.id ? a.name : winner === b.id ? b.name : null, highlights }) });
    card = r.ok ? await r.json() : null;
  } catch {}
  hooks.rivalry = card;
  box.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:10px auto;max-width:320px;background:#0d1020';
  if (card?.image) {
    const img = document.createElement('img');
    img.src = card.image;
    img.alt = 'Rivalry card art';
    img.style.cssText = 'width:100%;display:block;aspect-ratio:3/4;object-fit:cover';
    wrap.appendChild(img);
  }
  const cap = document.createElement('div');
  cap.style.cssText = 'padding:10px 12px;text-align:left';
  const title = document.createElement('b');
  title.textContent = `${a.name} ${a.rw} – ${b.rw} ${b.name}`;
  const line = document.createElement('div');
  line.className = 'muted';
  line.textContent = card?.summary ?? 'Rematch?';
  cap.append(title, line);
  wrap.appendChild(cap);
  box.appendChild(wrap);
  const share = $('res-share');
  share.classList.remove('hidden');
  share.onclick = async () => {
    const url = card?.id ? `${location.origin}/api/rivalry/${card.id}` : location.origin;
    const data = { title: 'Throw Hands rivalry', text: `${a.name} ${a.rw}-${b.rw} ${b.name}. ${card?.summary ?? ''}`, url: card?.image ? location.origin + card.image : url };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${data.text} ${data.url}`);
      toast('Rivalry card link copied!');
    } catch {
      toast(data.url, 5000);
    }
  };
}

// ---------- loop ----------
function startLoop() {
  if (loopStarted) return;
  loopStarted = true;
  let last = performance.now();
  const frames: number[] = [];
  // Tests on a CPU-only server can cap the render rate so pose detection gets the CPU.
  const renderCap = Number(params.get('renderfps') ?? 0);
  let lastRender = 0;
  const loop = (now: number) => {
    if (renderCap && now - lastRender < 1000 / renderCap - 2) {
      requestAnimationFrame(loop);
      return;
    }
    lastRender = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frames.push(now);
    while (frames.length && now - frames[0] > 1000) frames.shift();
    hooks.renderFps = frames.length;
    (hooks as any).renderMs = +arena.renderMs.toFixed(1);
    (hooks as any).frameMs = +(performance.now() - now).toFixed(1);
    if (pose) {
      hooks.poseFps = pose.tracker.fps;
      (hooks as any).inferMs = +(pose.lastFrame?.inferMs ?? 0).toFixed(1);
      $('pose-fps').textContent = `${pose.tracker.fps} fps ${pose.tracker.delegate ?? ''}`;
    }
    if (session && view) {
      if (pose && !calibrating && session.localIds.length) {
        session.localIds.forEach((_, i) => {
          if (i >= pose!.players) return;
          const g = pose!.latest[i];
          const acts = pose!.takeActions(i);
          for (const a of acts) hooks.localActions.push({ t: performance.now(), kind: a.kind, hand: a.hand, player: i });
          session!.input(i, g, acts);
        });
        hooks.lastGesture = pose.latest.map((g) => ({ present: g.present, blocking: g.blocking, xshield: g.xshield, move: g.move, legs: g.legs }));
      }
      const r = session.tick(dt);
      if (r) {
        view.setSnapshot(r.snap);
        view.handleEvents(r.events);
        logEvents(r.events);
        hooks.snapshot = r.snap;
        const lastLog = hooks.snapLog[hooks.snapLog.length - 1];
        if (!lastLog || lastLog.t !== r.snap.t) {
          hooks.snapLog.push({ t: r.snap.t, at: performance.timeOrigin + performance.now(), round: r.snap.round, timer: r.snap.timer, phase: r.snap.phase, hp: r.snap.f.map((f) => f.hp) });
          if (hooks.snapLog.length > 2000) hooks.snapLog.splice(0, 500);
        }
        if (hooks.mode === 'idle' && session.over) session.rematch();
        if (session.over && hooks.mode !== 'idle' && !resultsShown && !resultsTimer) resultsTimer = window.setTimeout(() => ((resultsTimer = 0), showResults()), 1600);
      }
      view.frame(dt);
    } else {
      arena.update(now / 1000);
      arena.render();
    }
    (hooks as any).loopMs = +(performance.now() - now).toFixed(1);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function logEvents(events: SimEvent[]) {
  if (hooks.mode === 'idle') return;
  const t = performance.now();
  for (const e of events) {
    hooks.events.push({ t, ...e });
    if (hooks.events.length > 5000) hooks.events.splice(0, 1000);
  }
}

// ---------- wiring ----------
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action!;
  if (a === 'menu') return backToMenu();
  startMode(a);
});

export function backToMenu() {
  teardown();
  import('./net/online').then((m) => m.leaveRoom()).catch(() => {});
  $('calib').classList.add('hidden');
  calibrating = false;
  idleArena();
  show('menu');
}

$('cam-retry').onclick = () => {
  cameraOk = false;
  pendingStart?.();
};
$('cam-demo').onclick = () => startMode('demo');
$('btn-quit').onclick = () => backToMenu();
$('res-rematch').onclick = () => {
  if (!session) return startMode(lastMode);
  resultsShown = false;
  show('game');
  session.rematch();
};
$('join-go').onclick = () => {
  const code = $<HTMLInputElement>('join-code').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) {
    $('join-error').textContent = 'Codes are 4 letters.';
    return;
  }
  import('./net/online').then((m) => m.joinRoom(code));
};

export function getPose() {
  return pose;
}
export { ensureCamera };

boot();
