// Real crowd audio for the arena (REVIEW.md 3:15 AM: the synthesized noise sounded like wind), generated once with
// ElevenLabs sound effects and served from /crowd/. Writes web/public/crowd/*.mp3 (+ crowd.json). Checks the 50% budget.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = env.ELEVENLABS_API_KEY;
const OUT = path.join(ROOT, 'web/public/crowd');
fs.mkdirSync(OUT, { recursive: true });
const SFX: { id: string; text: string; sec: number }[] = [
  { id: 'bed', text: 'Large indoor fight arena crowd ambience, thousands of people murmuring, chattering and cheering lightly between punches, steady, no music, no announcer', sec: 22 },
  { id: 'roar_0', text: 'Huge arena crowd erupts in a roar and cheers after a knockout punch', sec: 3 },
  { id: 'roar_1', text: 'Big crowd cheer and applause swell in a boxing arena after a great combination', sec: 3 },
  { id: 'roar_2', text: 'Stadium crowd screams and cheers as a fighter is slammed into the cage', sec: 3 },
  { id: 'ooh_0', text: 'Arena crowd reacting with a loud collective oooh to a near miss', sec: 2 },
  { id: 'ooh_1', text: 'Fight crowd says oooooh together after a big blocked punch', sec: 2 },
  { id: 'gasp_0', text: 'Large crowd gasps in shock all at once', sec: 2 },
  { id: 'chant_0', text: 'Arena crowd chanting rhythmically and clapping, building excitement', sec: 6 },
];
const sub = await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': KEY } })).json();
const remaining = sub.character_limit - sub.character_count;
const todo = SFX.filter((s) => !fs.existsSync(path.join(OUT, s.id + '.mp3')) || process.env.FORCE);
const estimate = todo.reduce((n, s) => n + s.sec * 34, 0);
console.log(`ElevenLabs ${sub.character_count}/${sub.character_limit}; this run ~${estimate} (cap: half of ${remaining})`);
if (estimate > remaining / 2) throw new Error('over the 50% budget');
for (const s of todo) {
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ text: s.text, duration_seconds: s.sec, prompt_influence: 0.55 }) });
  if (!r.ok) {
    console.log(s.id, 'ERR', r.status, (await r.text()).slice(0, 200));
    continue;
  }
  const raw = path.join(OUT, s.id + '.raw.mp3');
  fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  if (s.id === 'bed') {
    // Seamless loop: crossfade the last 2 s into the first 2 s (20 s result).
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-filter_complex', `[0:a]asplit[a][b];[a]atrim=0:2,asetpts=PTS-STARTPTS[head];[b]atrim=2,asetpts=PTS-STARTPTS[body];[body][head]acrossfade=d=2:c1=tri:c2=tri,loudnorm=I=-24:TP=-3[o]`, '-map', '[o]', '-ar', '44100', '-b:a', '96k', path.join(OUT, 'bed.mp3')]);
  } else execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-18:TP=-2', '-ar', '44100', '-b:a', '96k', path.join(OUT, s.id + '.mp3')]);
  fs.rmSync(raw);
  console.log(s.id, execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(OUT, s.id + '.mp3')]).toString().trim() + ' s');
}
fs.writeFileSync(path.join(OUT, 'crowd.json'), JSON.stringify({ source: 'ElevenLabs sound effects (generated for Throw Hands)', files: SFX.map((s) => s.id) }));
const after = await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': KEY } })).json();
console.log(`ElevenLabs after: ${after.character_count}/${after.character_limit}`);
