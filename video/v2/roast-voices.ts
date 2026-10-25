// Voices selected Gemini-written roasts (from tests/tools/roast-match.ts runs on the user's own drill sessions) in the
// announcer's ElevenLabs voice, checks each with speech-to-text (no extra words), and writes video/v2/roasts.json.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const ROOT = path.resolve(import.meta.dirname, '../..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = env.ELEVENLABS_API_KEY;
// Lines Gemini wrote about the roast scene's own events (record-scenes.ts, roast: true), with the scene time each was
// written for. Template fallbacks (source "template") are not used.
const SRC = process.env.ROASTS ?? path.join(ROOT, 'video/out/user_r1.roasts.json');
const LINES = (JSON.parse(fs.readFileSync(SRC, 'utf8')) as { t: number; text: string; source: string }[]).filter((l) => l.source.startsWith('gemini')).slice(0, 2).map((l) => ({ text: l.text, t: l.t, from: `${path.basename(SRC)} t=${l.t} (${l.source})` }));
const OUT = path.join(ROOT, 'video/out/v2roast');
fs.mkdirSync(OUT, { recursive: true });
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
const bank: { file: string; text: string; from: string; t: number }[] = [];
for (const [i, l] of LINES.entries()) {
  const file = path.join(OUT, `roast_${i}_${l.text.replace(/[^a-z]/gi, '').slice(0, 24)}.mp3`);
  if (!fs.existsSync(file)) {
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/IKne3meq5aSn9XLyUdCD?output_format=mp3_44100_128', { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ text: '[mischievously] ' + l.text, model_id: 'eleven_v3', voice_settings: { stability: 0.0, similarity_boost: 0.8, style: 0.9, use_speaker_boost: true } }) });
    if (!r.ok) { console.log(i, 'ERR', r.status); continue; }
    const raw = file + '.raw.mp3';
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-14:TP=-1.5', '-ar', '44100', '-b:a', '128k', file]);
    fs.rmSync(raw);
  }
  // Speech-to-text check: the clip must say only its line.
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  fd.append('file', new Blob([fs.readFileSync(file)]), 'a.mp3');
  const stt = await (await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': KEY }, body: fd })).json();
  const heard = String(stt.text ?? '');
  const extra = norm(heard).filter((w) => !norm(l.text).includes(w));
  console.log(extra.length <= 1 ? 'ok  ' : 'FAIL', i, JSON.stringify(l.text), 'heard', JSON.stringify(heard), extra.length ? 'extra: ' + extra.join(' ') : '');
  if (extra.length <= 1) bank.push({ file, text: l.text, from: l.from, t: l.t });
}
fs.writeFileSync(path.join(ROOT, 'video/v2/roasts.json'), JSON.stringify(bank, null, 1));
