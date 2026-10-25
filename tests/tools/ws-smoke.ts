// Protocol smoke test: two raw WebSocket clients duel to match_over. Usage: WS_URL=ws://localhost:8799/ws npx tsx tests/tools/ws-smoke.ts
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
const URL_ = process.env.WS_URL ?? 'ws://localhost:8799/ws';
function client(name: string) {
  const ws = new WebSocket(URL_);
  const c = { ws, id: randomUUID(), name, slot: 0, msgs: [] as any[], last: null as any, over: null as any, roster: null as any, errors: [] as any[] };
  ws.on('message', (d) => { const m = JSON.parse(String(d)); c.msgs.push(m.type); if (m.type === 'welcome') c.slot = m.you.slot; if (m.type === 'snapshot') c.last = m.s; if (m.type === 'match_over') c.over = m; if (m.type === 'roster') c.roster = m; if (m.type === 'error') c.errors.push(m); });
  return c;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const A = client('Alice'), B = client('Bob');
await new Promise((r) => A.ws.on('open', r)); await new Promise((r) => B.ws.on('open', r));
A.ws.send(JSON.stringify({ type: 'create', clientId: A.id, nickname: 'Alice' }));
await wait(300);
const code = A.roster.room; console.log('room', code);
B.ws.send(JSON.stringify({ type: 'join', room: code, clientId: B.id, nickname: 'Bob' }));
await wait(300);
const bad = client('X'); await new Promise((r) => bad.ws.on('open', r)); bad.ws.send(JSON.stringify({ type: 'join', room: 'ZZZZ', nickname: 'X' })); await wait(200); console.log('invalid code ->', bad.errors[0]?.code); bad.ws.close();
A.ws.send(JSON.stringify({ type: 'start', mode: 'duel' }));
const t0 = Date.now();
let i = 0;
while (!A.over && Date.now() - t0 < 200_000) {
  for (const c of [A, B]) c.ws.send(JSON.stringify({ type: 'state', t: Date.now(), present: true, blocking: c === B && i % 10 < 3, move: [0, 0] }));
  if (i % 5 === 0) A.ws.send(JSON.stringify({ type: 'action', kind: 'jab', hand: i % 10 ? 'L' : 'R', speed: 5 }));
  if (i % 9 === 0) B.ws.send(JSON.stringify({ type: 'action', kind: 'jab', hand: 'L', speed: 3 }));
  await wait(50); i++;
}
await wait(300);
console.log('A over', JSON.stringify(A.over)); console.log('B over', JSON.stringify(B.over));
console.log('same winner', A.over?.winner === B.over?.winner, 'secs', ((Date.now() - t0) / 1000).toFixed(1));
const fa = A.last.f.map((f: any) => [f.id, f.hp, f.rw]), fb = B.last.f.map((f: any) => [f.id, f.hp, f.rw]);
console.log('final snapshots A', JSON.stringify(fa), 'B', JSON.stringify(fb), 'tA', A.last.t, 'tB', B.last.t);
console.log('msg types A', [...new Set(A.msgs)].join(','));
A.ws.close(); B.ws.close();
process.exit(0);
