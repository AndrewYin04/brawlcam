// A landed Shoulder Throw is called "SHOULDER THROW!", not "BIG RIGHT HAND!". The view holds the throw's hit and its
// 'throw' event until the slam and delivers them together (hit first); the hit's 25 damage used to take the big-hit
// call, and the throw call then fell inside the 1 s pacing gap (seen live on fb00f2d: `calls: 2.433s BIG RIGHT HAND!`).
// Usage: npx tsx tests/unit/announcer-throw-call.ts
import fs from 'fs';
import path from 'path';
import type { SimEvent, Snapshot } from '../../shared/sim';

const ROOT = path.resolve(import.meta.dirname, '../..');
const callsJson = fs.readFileSync(path.join(ROOT, 'web/public/calls/calls.json'), 'utf8');
(globalThis as any).fetch = async (u: string) => (u === '/calls/calls.json' ? { ok: true, json: async () => JSON.parse(callsJson) } : { ok: false, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) });
const mem = new Map<string, string>();
(globalThis as any).window = { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } };
(globalThis as any).localStorage = (globalThis as any).window.localStorage;
let now = 100_000;
(globalThis as any).performance = { now: () => now };
const { Announcer, preloadCalls } = await import('../../web/src/game/announcer');
await preloadCalls();

const snap = { round: 1, f: [{ id: 1, hp: 100, rw: 0 }, { id: 2, hp: 75, rw: 0 }] } as unknown as Snapshot;
const ann = new Announcer();
// Held until the slam, delivered together: the throw's hit, then the 'throw' event.
ann.onEvent({ type: 'hit', attacker: 1, target: 2, damage: 25, kind: 'throw', blocked: false, shielded: false, isSuper: true, x: 0, y: 0, z: 0, speed: 0, guard: 100 } as SimEvent, snap);
ann.onEvent({ type: 'throw', id: 1, target: 2, damage: 25, x: 0, y: 0, z: 0 } as unknown as SimEvent, snap);
const said = ann.log.map((c) => `${c.key}:${c.text}`);
const ok = said.length === 1 && said[0] === 'throw:SHOULDER THROW!';
console.log(`${ok ? 'ok  ' : 'FAIL'} a landed throw plays exactly "SHOULDER THROW!" (got ${JSON.stringify(said)})`);
// A plain big hit still gets its call.
now += 10_000;
ann.onEvent({ type: 'hit', attacker: 1, target: 2, damage: 16, kind: 'hook', blocked: false, shielded: false, isSuper: false, x: 0, y: 0, z: 0, speed: 0, guard: 100 } as SimEvent, snap);
const big = ann.log.length === 2 && ann.log[1].key === 'big_hit';
console.log(`${big ? 'ok  ' : 'FAIL'} a 16-damage hook still gets a big-hit call (${ann.log[1]?.text})`);
if (!ok || !big) process.exit(1);
console.log('announcer throw call: all checks passed');
