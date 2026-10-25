// Repro: two different players (two browsers) with the same nickname both appear as identical-looking rows.
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
const BASE = process.env.BASE_URL ?? 'https://throwhands.tech';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function duel(nickA: string, nickB: string) {
  const mk = () => { const ws = new WebSocket(WS); const msgs: any[] = []; ws.on('message', (d) => msgs.push(JSON.parse(String(d)))); return { ws, msgs, open: new Promise((r) => ws.on('open', r)) }; };
  const A = mk(), B = mk(); await A.open; await B.open;
  A.ws.send(JSON.stringify({ type: 'create', clientId: randomUUID(), nickname: nickA, aiFixtures: true })); await wait(400);
  const room = A.msgs.find((m) => m.type === 'welcome').room;
  B.ws.send(JSON.stringify({ type: 'join', room, clientId: randomUUID(), nickname: nickB })); await wait(400);
  A.ws.send(JSON.stringify({ type: 'start', mode: 'duel', roundSeconds: 10 }));
  let i = 0;
  while (!A.msgs.some((m) => m.type === 'match_over') && i < 2000) {
    for (const c of [A, B]) c.ws.send(JSON.stringify({ type: 'state', present: true, move: [0, 0] }));
    if (i % 4 === 0) A.ws.send(JSON.stringify({ type: 'action', kind: 'jab', hand: 'L', speed: 5 }));
    await wait(50); i++;
  }
  A.ws.close(); B.ws.close();
}
await duel('E2E Dup', 'E2E Rival 1');
await duel('E2E Dup', 'E2E Rival 2');
await wait(2500);
const lb = await (await fetch(BASE + '/api/leaderboard?limit=100')).json();
const dups = lb.players.filter((p: any) => p.nickname === 'E2E Dup');
console.log('rows named E2E Dup:', dups.length, 'tags:', JSON.stringify(dups.map((p: any) => p.tag ?? null)));
// Bug if two rows share a name with nothing telling them apart.
const distinguishable = new Set(dups.map((p: any) => `${p.nickname}${p.tag ?? ''}`)).size === dups.length;
console.log('distinguishable:', distinguishable);
process.exitCode = distinguishable ? 0 : 1;
