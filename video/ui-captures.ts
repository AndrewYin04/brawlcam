// Captures real UI screens from the deployed site for the demo video (video/out/ui/<id>.png).
// No camera footage: pages that need a camera use a blank injected stream and the preview is hidden (?clean).
import { chromium, type BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'video/out/ui');
const BASE = process.env.BASE_URL ?? 'https://144-202-71-213.sslip.io';
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const want = (id: string) => !only.length || only.includes(id);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
async function ctx(): Promise<BrowserContext> {
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Blank camera so nothing third-party can appear on screen.
  await c.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const cv = document.createElement('canvas');
      cv.width = 640;
      cv.height = 480;
      cv.getContext('2d')!.fillRect(0, 0, 640, 480);
      return (cv as any).captureStream(15);
    };
    localStorage.setItem('throwhands.nick', 'Maya');
  });
  return c;
}

if (want('lobby')) {
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/?clean&nocomment&aifixture`);
  await p.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 90_000 });
  await p.click('[data-action=online-create]');
  await p.waitForFunction(() => (window as any).__brawl?.online?.room, null, { timeout: 20_000 });
  const room = await p.evaluate(() => (window as any).__brawl.online.room);
  // Friends join (lightweight clients with names).
  const friends: WebSocket[] = [];
  for (const [nick, color] of [['Leo', '#33b5ff'], ['Priya', '#ffc53d'], ['Sam', '#3dff9a']]) {
    const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws');
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ type: 'join', room, clientId: randomUUID(), nickname: nick, color }));
    friends.push(ws);
  }
  await p.waitForTimeout(1200);
  await p.check('input[name=mode][value=wso]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'lobby.png') });
  friends.forEach((f) => f.close());
  await c.close();
  console.log('ui lobby');
}

if (want('menu')) {
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/?clean&nocomment`);
  await p.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 90_000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(OUT, 'menu.png') });
  await c.close();
  console.log('ui menu');
}

if (want('forge')) {
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/?clean&nocomment`);
  await p.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 90_000 });
  await p.click('[data-action=forge]');
  // A prompt forged earlier tonight: served from the server cache, no new Meta call.
  await p.fill('#forge-prompt', process.env.FORGE_PROMPT ?? 'volcano samurai frog');
  await p.click('#forge-go');
  await p.waitForFunction(() => (window as any).__brawl.forge?.state === 'done', null, { timeout: 30_000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, 'forge.png') });
  await c.close();
  console.log('ui forge');
}

if (want('leaderboard')) {
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/?clean&nocomment`);
  await p.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 90_000 });
  await p.click('[data-action=leaderboard]');
  await p.waitForSelector('#lb table, #lb-empty, #lb-error', { timeout: 20_000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, 'leaderboard.png') });
  await c.close();
  console.log('ui leaderboard');
}

if (want('store')) {
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/?clean&nocomment`);
  await p.waitForFunction(() => (window as any).__brawl?.screen === 'menu', null, { timeout: 90_000 });
  await p.click('[data-action=store]');
  await p.waitForSelector('#skins .card', { timeout: 20_000 });
  await p.screenshot({ path: path.join(OUT, 'store.png') });
  await c.close();
  console.log('ui store');
}

await browser.close();
