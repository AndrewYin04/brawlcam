// Live commentary voice check: synthesizes sample lines with Gemini TTS using a given prompt style, transcribes them
// (ElevenLabs speech-to-text), and counts clips that read the delivery instruction aloud. Usage: STYLE=short npx tsx tests/tools/check-live-tts.ts
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const ROOT = path.resolve(import.meta.dirname, '../..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LINES: [string, string][] = [
  ['excitedly', 'Maya lands a three-hit combo and Leo is reeling!'],
  ['in rising disbelief', "Leo's guard just shattered, he's seeing stars!"],
  ['shouting with excitement', 'And that is a knockout! Maya takes the round!'],
  ['excitedly', 'Super uppercut sends Leo straight into the cage!'],
  ['fast and punchy', 'Jab, jab, hook, Maya is putting on a clinic!'],
  ['excitedly', 'Iron Wall holds and Leo eats the counter!'],
];
const style = process.env.STYLE ?? 'short';
const model = process.env.MODEL ?? 'gemini-3.8-flash-tts';
const out = path.join(ROOT, 'video/out/tts-check');
fs.mkdirSync(out, { recursive: true });
let leaks = 0, n = 0;
for (const [mood, line] of LINES) {
  const text = style === 'short' ? `Say ${mood}: ${line}` : `You are a live fight commentator in a packed arena. Say this ${mood}: ${line}`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } } } }) });
  const j: any = await r.json();
  const d = j?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
  if (!d) { console.log('no audio', r.status, JSON.stringify(j).slice(0, 160)); continue; }
  const pcm = path.join(out, `l${n}.pcm`), wav = path.join(out, `l${n}.wav`);
  fs.writeFileSync(pcm, Buffer.from(d.data, 'base64'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm, wav]);
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('file', new Blob([fs.readFileSync(wav)]), 'l.wav');
  const said = String(((await (await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, body: form })).json()) as any).text ?? '');
  const leak = /\bsay\b|commentator|excitedly|disbelief|punchy|shouting|arena/i.test(said) && !/shouting|arena/i.test(line);
  if (leak) leaks++;
  n++;
  console.log(`${leak ? 'LEAK' : 'ok  '} ${style} | ${said}`);
  await new Promise((res) => setTimeout(res, 6500)); // stay under the free-tier TTS rate limit
}
console.log(`${leaks}/${n} leaked (${style}, ${model})`);
