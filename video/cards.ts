// Title cards for the demo video, rendered from HTML with Playwright to 1280x720 PNGs (video/out/cards/<id>.png).
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'video/out/cards');
fs.mkdirSync(OUT, { recursive: true });

const base = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Bungee&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box} html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#070912;color:#eef2ff;font-family:Inter,system-ui,sans-serif}
.bg{position:absolute;inset:0;background:radial-gradient(ellipse at 75% 20%,rgba(255,61,110,.25),transparent 55%),radial-gradient(ellipse at 15% 85%,rgba(51,181,255,.2),transparent 55%)}
.wrap{position:absolute;inset:0;padding:50px 90px 120px;display:flex;flex-direction:column;justify-content:center}
h1{font-family:Bungee;font-size:132px;line-height:.95;margin:0;letter-spacing:3px;text-shadow:0 0 40px rgba(255,61,110,.5)} h1 span{color:#ff3d6e}
h2{font-family:Bungee;font-size:58px;line-height:1.05;margin:0 0 28px}
.k{font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:#ffc53d;font-size:20px;margin-bottom:18px}
p{font-size:30px;color:#9aa6c8;margin:10px 0;max-width:1000px;line-height:1.35}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}
.c{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.13);border-radius:18px;padding:22px 24px}
.c b{display:block;font-size:30px;margin-bottom:8px} .c span{color:#9aa6c8;font-size:22px;line-height:1.35}
.flow{display:flex;align-items:center;gap:14px;font-size:24px;flex-wrap:wrap} .n{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:14px 16px} .a{color:#ffc53d;font-weight:800;font-size:30px}
.url{font-family:Bungee;font-size:84px;color:#ffc53d}
.tag{display:inline-block;background:rgba(61,255,154,.12);color:#3dff9a;border:1px solid rgba(61,255,154,.35);border-radius:999px;padding:6px 14px;font-size:20px;margin:6px 8px 0 0}
</style></head><body><div class="bg"></div><div class="wrap">${body}</div></body></html>`;

const CARDS: Record<string, string> = {
  logo: `<div class="k">HackTX 2026</div><h1>THROW<br><span>HANDS</span></h1><p>Your body is the controller.</p>`,
  problem: `<div class="k">The problem</div><h2>Game night needs a console,<br>an accessory, and one room.</h2><p>Your friends are on other campuses, in other cities. Everyone already has a webcam and a browser.</p>`,
  ai: `<div class="k">How AI plays a role</div><h2>AI is the controller</h2>
    <div class="flow"><div class="n">Webcam</div><div class="a">→</div><div class="n">Pose model<br><small style="color:#9aa6c8">in your browser</small></div><div class="a">→</div><div class="n">Gesture engine<br><small style="color:#9aa6c8">punch · block · supers</small></div><div class="a">→</div><div class="n">Server simulation<br><small style="color:#9aa6c8">fair hits online</small></div></div>
    <div class="grid" style="margin-top:26px"><div class="c"><b>Meta Muse Spark + Muse Image</b><span>Fighter Forge and rivalry cards</span></div><div class="c"><b>Gemini + Gemini TTS</b><span>Live spoken fight commentary</span></div></div>
    <p style="font-size:22px">No video ever leaves your device: only joint positions travel.</p>`,
  tools: `<div class="k">Tools, harnesses, models</div><h2>How we built it</h2>
    <div class="grid">
      <div class="c"><b>Claude Code</b><span>Wrote and tested the game, server, and tools with us</span></div>
      <div class="c"><b>Playwright harness</b><span>Pro fighters' shadowboxing footage as the webcam in headless browsers; checks both screens match on every tick</span></div>
      <div class="c"><b>Vultr</b><span>Runs the game, every online room, and the AI proxy</span></div>
      <div class="c"><b>Tiger Data</b><span>Match events, Elo leaderboard, motion-data counts</span></div>
    </div>
    <div style="margin-top:14px"><span class="tag">0 mismatches across 2,160 shared ticks</span><span class="tag">6/6 jabs at 10-30 fps</span><span class="tag">three.js · MediaPipe · VRM</span></div>`,
  tests: `<div class="k">Tested end to end, every user path</div><h2>Real fighters' footage as the webcam</h2>
    <pre style="font:20px/1.45 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:18px 22px;margin:0;color:#c9d4ff;white-space:pre-wrap">$ npx playwright test online        # against the live server
ONLINE {"samples":2160,"mismatches":0,"p95ArrivalSkewMs":29,
        "aHits":33,"bHits":33,"winner":2,"elo_delta":{"1":-16,"2":16}}
  <span style="color:#3dff9a">✓</span> fighter A vs fighter B: full online best-of-3 (1.9m)

$ npx playwright test wso brawl practice supers
  <span style="color:#3dff9a">✓</span> winner stays on: 8 browsers, 4 matches, cheers, reconnect
  <span style="color:#3dff9a">✓</span> 8 browsers, 8 fighter clips: 0 state mismatches
  <span style="color:#3dff9a">✓</span> won by KO · lost by KO · won on time · drawn round
  <span style="color:#3dff9a">✓</span> shield blocks all damage for 3 s; blast can be blocked</pre>`,
  business: `<div class="k">What's next</div><h2>How it makes money</h2>
    <div class="grid" style="grid-template-columns:repeat(3,1fr)"><div class="c"><b>Cosmetics</b><span>Skins, auras, AI-forged fighters; $5/month season pass</span></div><div class="c"><b>Ranked play</b><span>Elo matchmaking and seasons</span></div><div class="c"><b>Motion data</b><span>Opt-in, anonymized strike and block sequences for robotics labs</span></div></div>`,
  close: `<div class="k">Pull up a friend</div><h1 style="font-size:110px">THROW<br><span>HANDS</span></h1><div class="url" style="margin-top:20px">throwhands.tech</div><p style="font-size:22px">Built at HackTX 2026 with Claude Code</p>`,
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
for (const [id, body] of Object.entries(CARDS)) {
  await page.setContent(base(body), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, id + '.png') });
  console.log('card', id);
}
await b.close();
