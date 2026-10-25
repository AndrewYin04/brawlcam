// Voiceover per script segment with ElevenLabs (key from .env; never logged). Writes video/out/vo/<id>.mp3.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = env.ELEVENLABS_API_KEY;
const VOICE = process.env.VOICE ?? 'TX3LPaxmHKxFdv7VOQHJ'; // Liam: energetic
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'video/script.json'), 'utf8'));
const out = path.join(ROOT, 'video/out/vo');
fs.mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
for (const seg of script.segments) {
  if (only.length && !only.includes(seg.id)) continue;
  const f = path.join(out, seg.id + '.mp3');
  if (fs.existsSync(f) && !process.env.FORCE) continue;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: seg.vo, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
  });
  if (!r.ok) {
    console.log(seg.id, 'ERR', r.status, (await r.text()).slice(0, 200));
    continue;
  }
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();
  console.log(seg.id, dur + ' s');
}
