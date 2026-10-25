// Repro: someone who joins a room after the match started must be put into it as a spectator (gets match_start + snapshots).
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
const URL_ = process.env.WS_URL ?? 'wss://144-202-71-213.sslip.io/ws';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function client() { const ws = new WebSocket(URL_); const msgs: any[] = []; ws.on('message', (d) => msgs.push(JSON.parse(String(d)))); return { ws, msgs, open: new Promise((r) => ws.on('open', r)) }; }
const A = client(); await A.open;
A.ws.send(JSON.stringify({ type: 'create', clientId: randomUUID(), nickname: 'E2E Host' }));
await wait(400);
const room = A.msgs.find((m) => m.type === 'welcome').room;
A.ws.send(JSON.stringify({ type: 'start', mode: 'duel' }));
await wait(1500);
const S = client(); await S.open;
S.ws.send(JSON.stringify({ type: 'join', room, clientId: randomUUID(), nickname: 'E2E Late' }));
await wait(1500);
const gotStart = S.msgs.some((m) => m.type === 'match_start');
const gotSnap = S.msgs.some((m) => m.type === 'snapshot');
console.log('late joiner got match_start:', gotStart, 'snapshots:', gotSnap);
A.ws.close(); S.ws.close();
process.exitCode = gotStart && gotSnap ? 0 : 1;
