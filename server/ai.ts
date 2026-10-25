// Server-side AI proxies: Gemini (commentary + TTS) and Meta Model API (Fighter Forge, rivalry card).
// Keys never reach the browser. Everything fails soft with a usable fallback.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const META_BASE = 'https://api.meta.ai/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Verified 2026-10-24 against the key's model list: flash-lite answers in ~0.6 s without thinking.
const GEMINI_TEXT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const GEMINI_TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
// Meta prices (dev.meta.ai/docs/pricing-rate-limits, checked 2026-10-24): $1.25/M input, $4.25/M output, $0.01/image.
const META_IN = 1.25 / 1e6;
const META_OUT = 4.25 / 1e6;
const META_IMAGE = 0.01;
const META_CAP_USD = 20;

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const SPEND_FILE = path.join(DATA_DIR, 'meta-spend.json');
const CACHE_DIR = path.join(DATA_DIR, 'forge-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

export const aiState = {
  metaSpendUsd: 0,
  metaCalls: 0,
  metaCapped: false,
  geminiCalls: 0,
  gemini429: 0,
  tts429: 0,
  lastGeminiError: '',
  lastMetaError: '',
};
try {
  const s = JSON.parse(fs.readFileSync(SPEND_FILE, 'utf8'));
  aiState.metaSpendUsd = s.metaSpendUsd ?? 0;
  aiState.metaCalls = s.metaCalls ?? 0;
} catch {}
aiState.metaCapped = aiState.metaSpendUsd >= META_CAP_USD;

function saveSpend() {
  try {
    fs.writeFileSync(SPEND_FILE, JSON.stringify({ metaSpendUsd: aiState.metaSpendUsd, metaCalls: aiState.metaCalls, at: new Date().toISOString() }));
  } catch {}
}

function addMetaSpend(usd: number) {
  aiState.metaSpendUsd += usd;
  aiState.metaCalls++;
  if (aiState.metaSpendUsd >= META_CAP_USD && !aiState.metaCapped) {
    aiState.metaCapped = true;
    console.error(`[meta] spend estimate reached $${aiState.metaSpendUsd.toFixed(2)}; Meta calls disabled, using fallbacks`);
  }
  saveSpend();
}

/** Sliding-window limiter so the free tier is not exhausted. */
class Limiter {
  private stamps: number[] = [];
  private blockedUntil = 0;
  constructor(private perMinute: number) {}
  take(): boolean {
    const now = Date.now();
    if (now < this.blockedUntil) return false;
    this.stamps = this.stamps.filter((t) => now - t < 60_000);
    if (this.stamps.length >= this.perMinute) return false;
    this.stamps.push(now);
    return true;
  }
  backoff(ms: number) {
    this.blockedUntil = Date.now() + ms;
  }
}
const textLimiter = new Limiter(Number(process.env.GEMINI_TEXT_RPM ?? 25));
const ttsLimiter = new Limiter(Number(process.env.GEMINI_TTS_RPM ?? 8));

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; json: any }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal });
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: r.status, json };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- Gemini commentary ----------------

const COMMENTATOR_SYSTEM =
  'You are the live hype commentator for Throw Hands, a family-friendly webcam fighting game where real people fight as superheroes. ' +
  'Given what just happened, reply with ONE short, punchy, funny line (max 14 words). Use fighter names. No emojis, no quotes, no hashtags, nothing violent beyond cartoon boxing.';

export async function commentaryLine(summary: string): Promise<{ text: string; source: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (key && textLimiter.take()) {
    for (const model of GEMINI_TEXT_MODELS) {
      try {
        const body: any = {
          systemInstruction: { parts: [{ text: COMMENTATOR_SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: summary.slice(0, 1500) }] }],
          generationConfig: { maxOutputTokens: 120, temperature: 1.0 },
        };
        if (model.startsWith('gemini-3.8')) body.generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
        const { status, json } = await fetchJson(`${GEMINI_BASE}/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) }, 4000);
        aiState.geminiCalls++;
        if (status === 429) {
          aiState.gemini429++;
          textLimiter.backoff(20_000);
          break;
        }
        const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('').trim();
        if (status === 200 && text) return { text: cleanLine(text), source: model };
        aiState.lastGeminiError = `${model} ${status} ${json?.error?.message ?? ''}`.slice(0, 200);
      } catch (e) {
        aiState.lastGeminiError = String(e).slice(0, 200);
      }
    }
  }
  return { text: templateLine(summary), source: 'template' };
}

function cleanLine(s: string) {
  return s.replace(/["“”*#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

/** Offline fallback lines when Gemini is unavailable. */
function templateLine(summary: string): string {
  const names = [...summary.matchAll(/([A-Z][\w' ]{1,20}?) (?:landed|blocked|fired|KO)/g)].map((m) => m[1].trim());
  const n = names[0] ?? 'What a fighter';
  const lines = [`${n} is throwing hands out there!`, `Big shots! ${n} came to play!`, `Ooh, the crowd felt that one!`, `${n} is heating up!`, `Keep those hands up, folks!`, `This one is going the distance!`];
  return lines[Math.floor(Math.random() * lines.length)];
}

export async function speak(text: string): Promise<{ mime: string; b64: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !ttsLimiter.take()) return null;
  for (const model of GEMINI_TTS_MODELS) {
    try {
      const { status, json } = await fetchJson(
        `${GEMINI_BASE}/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `Say it like an excited arena announcer: ${text}` }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } },
          }),
        },
        6000,
      );
      if (status === 429) {
        aiState.tts429++;
        ttsLimiter.backoff(30_000);
        return null;
      }
      const d = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
      if (status === 200 && d?.data) return { mime: d.mimeType ?? 'audio/wav', b64: d.data };
    } catch {}
  }
  return null;
}

// ---------------- Meta: Fighter Forge ----------------

export interface ForgeResult {
  name: string;
  backstory: string;
  moves: string[];
  colors: string[];
  imagePrompt: string;
  image?: string; // data URL
  source: 'meta' | 'cache' | 'fallback';
  refused?: boolean;
  message?: string;
}

const FORGE_SYSTEM =
  'You create fighters for Throw Hands, a family-friendly superhero fighting game. ' +
  'Reply with JSON only: {"name": string (max 3 words), "backstory": string (max 30 words), "moves": [exactly 3 short move names], ' +
  '"colors": [2 hex colors like "#ff4500" that fit the fighter], "imagePrompt": string (a vivid prompt for a cartoon trading-card portrait of the fighter, no text in the image)}. ' +
  'If the request is hateful, sexual, or targets a real person, reply {"refused": true, "message": "<one friendly sentence>"}.';

const FALLBACK_FIGHTERS: Omit<ForgeResult, 'source'>[] = [
  { name: 'Captain Comet', backstory: 'A retired astronaut who found out her punches leave stardust trails.', moves: ['Meteor Jab', 'Orbit Hook', 'Big Bang Blast'], colors: ['#33b5ff', '#ffc53d'], imagePrompt: '' },
  { name: 'Iron Rook', backstory: 'A chess-piece robot who decided checkmate should be physical.', moves: ['Castle Crush', 'Pawn Storm', 'Checkmate Uppercut'], colors: ['#b0b8c8', '#ff3d6e'], imagePrompt: '' },
  { name: 'Neon Viper', backstory: 'Glows in the dark, strikes in the light, never misses leg day.', moves: ['Fang Jab', 'Venom Hook', 'Neon Burst'], colors: ['#3dff9a', '#b03dff'], imagePrompt: '' },
];

function cacheKey(prompt: string) {
  return crypto.createHash('sha256').update(prompt.trim().toLowerCase()).digest('hex').slice(0, 24);
}

export async function forge(prompt: string, opts: { withImage?: boolean; timeoutMs?: number } = {}): Promise<ForgeResult> {
  const clean = prompt.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!clean) return { ...FALLBACK_FIGHTERS[Math.floor(Math.random() * FALLBACK_FIGHTERS.length)], source: 'fallback', message: 'Type an idea for your fighter, like "lava golem with a crown".' };
  const file = path.join(CACHE_DIR, cacheKey(clean) + '.json');
  if (fs.existsSync(file)) {
    try {
      return { ...JSON.parse(fs.readFileSync(file, 'utf8')), source: 'cache' };
    } catch {}
  }
  const key = process.env.META_API_KEY;
  if (!key || aiState.metaCapped) return { ...fallbackFor(clean), source: 'fallback', message: key ? 'Forge is resting; here is a house fighter.' : undefined };
  try {
    const { status, json } = await fetchJson(
      `${META_BASE}/chat/completions`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'muse-spark-1.3',
          reasoning_effort: 'minimal',
          max_tokens: 1000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: FORGE_SYSTEM },
            { role: 'user', content: clean },
          ],
        }),
      },
      Math.min(opts.timeoutMs ?? 8000, 8000),
    );
    const u = json?.usage;
    if (u) addMetaSpend((u.prompt_tokens ?? 0) * META_IN + (u.completion_tokens ?? 0) * META_OUT);
    if (status !== 200) throw new Error(`meta chat ${status}: ${json?.error?.message ?? JSON.stringify(json).slice(0, 120)}`);
    const msg = json?.choices?.[0]?.message;
    if (msg?.refusal) return { ...fallbackFor(clean), source: 'fallback', refused: true, message: "Let's forge a different fighter. Try something heroic!" };
    const parsed = JSON.parse(String(msg?.content ?? '{}').replace(/^```json|```$/g, ''));
    if (parsed.refused) return { ...fallbackFor(clean), source: 'fallback', refused: true, message: String(parsed.message ?? "Let's forge a different fighter.").slice(0, 160) };
    const result: ForgeResult = {
      name: String(parsed.name ?? 'Mystery Fighter').slice(0, 24),
      backstory: String(parsed.backstory ?? '').slice(0, 220),
      moves: (Array.isArray(parsed.moves) ? parsed.moves : []).slice(0, 3).map((m: unknown) => String(m).slice(0, 24)),
      colors: (Array.isArray(parsed.colors) ? parsed.colors : []).filter((c: unknown) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 2),
      imagePrompt: String(parsed.imagePrompt ?? clean).slice(0, 400),
      source: 'meta',
    };
    while (result.moves.length < 3) result.moves.push(['Power Jab', 'Spin Hook', 'Sky Uppercut'][result.moves.length]);
    if (result.colors.length < 2) result.colors.push('#ff3d6e', '#ffc53d');
    result.colors = result.colors.slice(0, 2);
    fs.writeFileSync(file, JSON.stringify(result));
    return result;
  } catch (e) {
    aiState.lastMetaError = String(e).slice(0, 200);
    return { ...fallbackFor(clean), source: 'fallback', message: 'The Forge is busy, so here is a house fighter.' };
  }
}

export async function forgeImage(prompt: string, imagePrompt: string, timeoutMs = 13000): Promise<string | null> {
  const clean = prompt.replace(/\s+/g, ' ').trim().slice(0, 140);
  const file = path.join(CACHE_DIR, cacheKey(clean) + '.jpg');
  if (fs.existsSync(file)) return '/api/forge/image/' + cacheKey(clean);
  const key = process.env.META_API_KEY;
  if (!key || aiState.metaCapped || !imagePrompt) return null;
  const url = await metaImage(`${imagePrompt}. Bold cartoon trading-card art, dynamic pose, glowing aura, no text, no letters.`, timeoutMs);
  if (!url) return null;
  fs.writeFileSync(file, Buffer.from(url, 'base64'));
  return '/api/forge/image/' + cacheKey(clean);
}

export function forgeImagePath(id: string): string | null {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const f = path.join(CACHE_DIR, id + '.jpg');
  return fs.existsSync(f) ? f : null;
}

async function metaImage(prompt: string, timeoutMs: number): Promise<string | null> {
  const key = process.env.META_API_KEY;
  if (!key || aiState.metaCapped) return null;
  try {
    const { status, json } = await fetchJson(
      `${META_BASE}/images/generations`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        // reasoning_strength "low" = single pass (~10 s instead of ~17 s), measured 2026-10-24.
        body: JSON.stringify({ model: 'muse-image-1.0', prompt: prompt.slice(0, 900), n: 1, size: '768x1024', output_format: 'jpeg', reasoning_strength: 'low' }),
      },
      timeoutMs,
    );
    if (status === 200) addMetaSpend(META_IMAGE);
    const b64 = json?.data?.[0]?.b64_json;
    if (status !== 200 || !b64) {
      aiState.lastMetaError = `image ${status} ${json?.error?.message ?? ''}`.slice(0, 200);
      return null;
    }
    return b64;
  } catch (e) {
    aiState.lastMetaError = String(e).slice(0, 200);
    return null;
  }
}

function fallbackFor(prompt: string) {
  const i = parseInt(cacheKey(prompt).slice(0, 2), 16) % FALLBACK_FIGHTERS.length;
  return FALLBACK_FIGHTERS[i];
}

// ---------------- Meta: rivalry card ----------------

const RIVALRY_DIR = path.join(DATA_DIR, 'rivalry');
fs.mkdirSync(RIVALRY_DIR, { recursive: true });

export async function rivalryCard(input: { matchId: string; a: string; b: string; scoreA: number; scoreB: number; winner: string | null; highlights: string }) {
  const id = crypto.createHash('sha256').update(input.matchId).digest('hex').slice(0, 24);
  const jsonFile = path.join(RIVALRY_DIR, id + '.json');
  if (fs.existsSync(jsonFile)) return JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  let summary = `${input.winner ?? 'Nobody'} wins ${Math.max(input.scoreA, input.scoreB)}-${Math.min(input.scoreA, input.scoreB)}. Rematch?`;
  const key = process.env.META_API_KEY;
  let source = 'fallback';
  if (key && !aiState.metaCapped) {
    try {
      const { status, json } = await fetchJson(
        `${META_BASE}/chat/completions`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'muse-spark-1.3',
            reasoning_effort: 'minimal',
            max_tokens: 600,
            messages: [
              { role: 'system', content: 'Write ONE playful trash-talk line (max 16 words) summarizing a friendly webcam boxing match between two friends, ending with a rematch challenge. No quotes.' },
              { role: 'user', content: `${input.a} vs ${input.b}. Score ${input.scoreA}-${input.scoreB}. Winner: ${input.winner ?? 'draw'}. Highlights: ${input.highlights.slice(0, 400)}` },
            ],
          }),
        },
        8000,
      );
      const u = json?.usage;
      if (u) addMetaSpend((u.prompt_tokens ?? 0) * META_IN + (u.completion_tokens ?? 0) * META_OUT);
      const t = json?.choices?.[0]?.message?.content;
      if (status === 200 && t) {
        summary = cleanLine(String(t));
        source = 'meta';
      }
    } catch {}
  }
  const b64 = await metaImage(
    `Epic cartoon fight-poster card: two superhero fighters named ${input.a} and ${input.b} facing off in a neon boxing ring, dramatic lighting, trading card style, no text`,
    14000,
  );
  let image: string | null = null;
  if (b64) {
    fs.writeFileSync(path.join(RIVALRY_DIR, id + '.jpg'), Buffer.from(b64, 'base64'));
    image = '/api/rivalry/image/' + id;
  }
  const out = { id, summary, image, source, a: input.a, b: input.b, scoreA: input.scoreA, scoreB: input.scoreB, winner: input.winner };
  fs.writeFileSync(jsonFile, JSON.stringify(out));
  return out;
}

export function rivalryPath(id: string, ext: 'jpg' | 'json'): string | null {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const f = path.join(RIVALRY_DIR, `${id}.${ext}`);
  return fs.existsSync(f) ? f : null;
}
