// Fighter Forge: Muse Spark writes the fighter, Muse Image paints the card, the card's colors tint the avatar.
import { show, toast, hooks } from '../main';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface SavedFighter {
  prompt: string;
  name: string;
  backstory: string;
  moves: string[];
  colors: string[];
  image: string | null;
  source: string;
}

export function savedFighter(): SavedFighter | null {
  try {
    return JSON.parse(localStorage.getItem('throwhands.fighter') ?? 'null');
  } catch {
    return null;
  }
}

/** Most saturated, common color in the image (simple histogram over a downscaled canvas). */
export async function dominantColor(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 64;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    // Histogram of saturated colors; the winning bin's average color is the dominant color.
    const bins = new Map<number, { w: number; count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
      const sat = max ? (max - min) / max : 0;
      if (sat < 0.35 || max < 70) continue; // skip greys and darks
      const key = ((r >> 5) << 6) | ((gg >> 5) << 3) | (b >> 5);
      const bin = bins.get(key) ?? { w: 0, count: 0, r: 0, g: 0, b: 0 };
      bin.w += 1 + sat;
      bin.count++;
      bin.r += r;
      bin.g += gg;
      bin.b += b;
      bins.set(key, bin);
    }
    let best: { w: number; count: number; r: number; g: number; b: number } | null = null;
    for (const b of bins.values()) if (!best || b.w > best.w) best = b;
    if (!best) return null;
    const hex = (v: number) => Math.round(Math.min(255, v)).toString(16).padStart(2, '0');
    return `#${hex(best.r / best.count)}${hex(best.g / best.count)}${hex(best.b / best.count)}`;
  } catch {
    return null;
  }
}

function setColor(c: string) {
  if (!/^#[0-9a-f]{6}$/i.test(c)) return;
  try {
    localStorage.setItem('throwhands.color', c);
  } catch {}
}

export async function showForge() {
  const page = $('page');
  page.innerHTML = `
    <h2>🔥 Fighter Forge</h2>
    <p class="muted">Describe a fighter. Meta's Muse Spark writes their name, story, and moves; Muse Image paints their card. Your suit takes the card's colors.</p>
    <div class="row" style="justify-content:flex-start">
      <input id="forge-prompt" class="code-input" style="font:16px system-ui;letter-spacing:0;text-transform:none;width:min(100%,460px);text-align:left" maxlength="140" placeholder="lava golem with a crown" />
      <button class="btn primary" id="forge-go">Forge</button>
      <button class="btn ghost" data-action="menu">Back</button>
    </div>
    <p id="forge-status" class="muted"></p>
    <div id="forge-result" class="cards" style="grid-template-columns:minmax(200px,300px) 1fr;align-items:start"></div>`;
  show('page');
  const input = $<HTMLInputElement>('forge-prompt');
  const saved = savedFighter();
  if (saved) {
    input.value = saved.prompt;
    render(saved);
  }
  $('forge-go').onclick = () => run(input.value);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run(input.value);
  });
  input.focus();
}

let running = false;
async function run(prompt: string) {
  if (running) return;
  running = true;
  const status = $('forge-status');
  const btn = $<HTMLButtonElement>('forge-go');
  btn.disabled = true;
  const t0 = performance.now();
  status.textContent = '⚒️ Forging your fighter…';
  hooks.forge = { state: 'text', ms: 0 };
  const deadline = t0 + 15000;
  const timeout = (ms: number) => new Promise<null>((r) => setTimeout(() => r(null), Math.max(0, ms)));
  try {
    const textRes: any = await Promise.race([
      fetch('/api/forge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) }).then((r) => (r.ok ? r.json() : null)),
      timeout(deadline - performance.now()),
    ]).catch(() => null);
    const fighter: SavedFighter = textRes
      ? { prompt, name: textRes.name, backstory: textRes.backstory, moves: textRes.moves, colors: textRes.colors, image: null, source: textRes.source }
      : { prompt, name: 'Captain Comet', backstory: 'The Forge timed out, so a house fighter stepped in.', moves: ['Meteor Jab', 'Orbit Hook', 'Big Bang Blast'], colors: ['#33b5ff', '#ffc53d'], image: null, source: 'fallback' };
    if (textRes?.message) toast(textRes.message, 4000);
    render(fighter, true);
    hooks.forge = { state: 'image', ms: Math.round(performance.now() - t0), source: fighter.source, refused: !!textRes?.refused };
    if (fighter.source !== 'fallback' && textRes?.imagePrompt) {
      status.textContent = '🎨 Painting the card…';
      const img: any = await Promise.race([
        fetch('/api/forge/image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, imagePrompt: textRes.imagePrompt }) }).then((r) => (r.ok ? r.json() : null)),
        timeout(deadline - performance.now()),
      ]).catch(() => null);
      if (img?.image) {
        fighter.image = img.image;
        const dom = await dominantColor(img.image);
        if (dom) fighter.colors = [dom, fighter.colors[1] ?? dom];
      }
    }
    setColor(fighter.colors[0]);
    try {
      localStorage.setItem('throwhands.fighter', JSON.stringify(fighter));
    } catch {}
    render(fighter);
    const ms = Math.round(performance.now() - t0);
    status.textContent = fighter.image ? `Forged in ${(ms / 1000).toFixed(1)} s. Your suit now wears these colors.` : fighter.source === 'fallback' ? 'Using a house fighter. The game works the same!' : `Card art is taking too long, so your fighter is ready without it (${(ms / 1000).toFixed(1)} s).`;
    hooks.forge = { state: 'done', ms, source: fighter.source, image: !!fighter.image, refused: !!textRes?.refused, name: fighter.name };
  } finally {
    running = false;
    btn.disabled = false;
  }
}

function render(f: SavedFighter, pendingImage = false) {
  const box = $('forge-result');
  box.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = `padding:0;overflow:hidden;border:2px solid ${/^#[0-9a-f]{6}$/i.test(f.colors[0]) ? f.colors[0] : '#888'}`;
  if (f.image) {
    const img = document.createElement('img');
    img.src = f.image;
    img.alt = `${f.name} card art`;
    img.style.cssText = 'width:100%;aspect-ratio:3/4;object-fit:cover;display:block';
    card.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.style.cssText = `aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;font-size:56px;background:linear-gradient(160deg,${f.colors[0]},${f.colors[1] ?? '#222'})`;
    ph.textContent = pendingImage ? '🎨' : '🥊';
    card.appendChild(ph);
  }
  const info = document.createElement('div');
  info.className = 'card';
  const h = document.createElement('h3');
  h.textContent = f.name;
  h.style.margin = '0 0 6px';
  const p = document.createElement('p');
  p.textContent = f.backstory;
  const ul = document.createElement('ul');
  for (const m of f.moves) {
    const li = document.createElement('li');
    li.textContent = m;
    ul.appendChild(li);
  }
  const sw = document.createElement('div');
  sw.className = 'row';
  sw.style.justifyContent = 'flex-start';
  for (const c of f.colors) {
    const s = document.createElement('span');
    s.style.cssText = `width:28px;height:28px;border-radius:50%;display:inline-block;background:${/^#[0-9a-f]{6}$/i.test(c) ? c : '#888'}`;
    sw.appendChild(s);
  }
  const fight = document.createElement('button');
  fight.className = 'btn primary';
  fight.textContent = `Fight as ${f.name}`;
  fight.dataset.action = 'practice';
  fight.onclick = () => {
    try {
      localStorage.setItem('throwhands.nick', f.name.slice(0, 16));
    } catch {}
  };
  const src = document.createElement('p');
  src.className = 'fineprint';
  src.textContent = f.source === 'meta' || f.source === 'cache' ? 'Written by Muse Spark, painted by Muse Image (Meta Model API).' : 'House fighter (AI unavailable right now).';
  info.append(h, p, ul, sw, fight, src);
  box.append(card, info);
}
