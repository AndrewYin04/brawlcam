// Pre-rendered commentator stock calls (REVIEW.md 2:35 AM item 4): short, high-energy announcer lines, generated once
// with ElevenLabs and served as static files, so big moments get an instant voiced call (no latency, no rate limit).
// Writes web/public/calls/<id>.mp3 (loudness-normalised, silence trimmed) and web/public/calls/calls.json.
// Budget rule: never spend more than 50% of the remaining ElevenLabs characters (checked before generating).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = env.ELEVENLABS_API_KEY;
const VOICE = process.env.VOICE ?? 'IKne3meq5aSn9XLyUdCD'; // Charlie: deep, confident, energetic
const MODEL = process.env.MODEL ?? 'eleven_v3';
export const CALLS: Record<string, string[]> = {
  round1: ['Round one... FIGHT!', "ROUND ONE! LET'S GO!"],
  round2: ['Round two! FIGHT!'],
  round3: ['Final round! FIGHT!'],
  fight: ['FIGHT!'],
  ko: ['K.O.!', "IT'S OVER!", 'LIGHTS OUT!', "AND THAT'S THE FIGHT!", 'GOOD NIGHT!'],
  guard_break: ['GUARD BROKEN!', 'THE GUARD SHATTERS!', 'WIDE OPEN!'],
  cage: ['INTO THE CAGE!', 'OFF THE FENCE!', 'SLAMMED INTO THE CAGE!'],
  super_uppercut: ['SUPER UPPERCUT!', 'SKY HIGH!'],
  ironwall: ['IRON WALL!', 'NOTHING GETS THROUGH!'],
  counter: ['COUNTERED!'],
  blast: ['ENERGY BLAST!'],
  big_hit: ['OHHH!', 'WHAT A SHOT!', 'BIG RIGHT HAND!', 'THAT ONE LANDED!', 'OOF!'],
  combo: ['COMBO!', 'THREE IN A ROW!', 'UNLOADING!'],
  low_hp: ["THEY'RE HURT!", "ONE MORE AND IT'S OVER!", 'HANGING ON!'],
  blocked: ['BLOCKED!', 'GREAT DEFENSE!'],
  match_over: ['WHAT A FIGHT!', 'WE HAVE A WINNER!', "THAT'S THE MATCH!", 'GREAT MATCH!'],
  draw: ["IT'S A DRAW!"],
  time: ['TIME!', "THAT'S TIME!"],
  throw: ['SHOULDER THROW!'],
  meter_ready: ['THE SUPER IS READY!', 'METER IS FULL!'],
  filler: ['KEEP THOSE HANDS UP!', 'PRESSURE, PRESSURE!', 'THE CROWD IS LOVING THIS!', 'WHAT A FIGHT WE HAVE!', 'WATCH THE JAB!', 'BEAUTIFUL MOVEMENT!'],
  clinch: ['CLINCH!'],
  // Context calls (REVIEW.md 6:08 AM): the round start that mentions the score, and the match result chosen by how the
  // match went (web/src/game/announcer-calls.ts picks them, falling back to the generic lines above).
  match_point: ['MATCH POINT! ROUND TWO!'],
  decider: ['ONE ROUND EACH... THIS DECIDES IT!'],
  mo_flawless: ['FLAWLESS!'],
  mo_comeback: ['WHAT A COMEBACK!', 'FROM THE BRINK!'],
  mo_super: ['SUPER FINISH!'],
  mo_close: ['BY A HAIR!', 'DOWN TO THE WIRE!'],
  mo_dominant: ['TOTAL DOMINATION!', 'NOT EVEN CLOSE!'],
  mo_decision: ['WINNER BY DECISION!'],
  rematch: ['RUN IT BACK?', 'REMATCH?'],
  // Generic roasts (planner 5:10 AM item 2): no names, school-appropriate. Played when the live Gemini roast for that
  // moment is caption-only (Gemini TTS is out of quota); the caption keeps the specific Gemini line.
  roast_whiff: ['Swing and a miss! The air is winning.', 'That punch is still looking for a target.', 'Bold strategy, hitting nothing.', 'The wind felt that one.'],
  roast_guard_break: ['Guard? What guard?', 'Turtle mode has been cancelled.', 'Those arms have left the building.'],
  roast_big_hit: ["That one's going in the highlight reel!", "Somebody check if they're still logged in.", "Oof. That's gonna leave a pixel."],
  roast_comeback: ["Don't call it a comeback!", 'Plot twist! We have a fight!', 'The underdog has teeth!'],
  roast_ko: ['Rest in pixels.', 'Taking a nap on the mat!', 'Rematch button is right there.'],
  roast_blocked: ["Knock knock. Nobody's home.", 'Punching a wall would be faster.'],
  roast_idle: ['Are we fighting or slow dancing?', 'Even the crowd is doing more cardio.'],
};
// Delivery: announcer calls are shouted; roasts are wry.
const tagFor = (key: string) => (key.startsWith('roast_') ? '[mischievously] ' : process.env.TAG ?? '[shouting excitedly] ');
const OUT = path.join(ROOT, 'web/public/calls');
fs.mkdirSync(OUT, { recursive: true });
const sub = await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': KEY } })).json();
const remaining = sub.character_limit - sub.character_count;
const items = Object.entries(CALLS).flatMap(([k, lines]) => lines.map((text, i) => ({ id: `${k}_${i}`, key: k, text })));
const ONLY = process.argv.slice(2);
const todo = items.filter((it) => (ONLY.length ? ONLY.includes(it.id) : !fs.existsSync(path.join(OUT, it.id + '.mp3')) || process.env.FORCE));
const cost = todo.reduce((n, it) => n + it.text.length + tagFor(it.key).length, 0);
console.log(`ElevenLabs: ${sub.character_count}/${sub.character_limit} used, ${remaining} remaining; this run needs ${cost} characters (cap ${Math.floor(remaining / 2)})`);
if (cost > remaining / 2) throw new Error('over the 50% budget');
for (const it of todo) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: tagFor(it.key) + it.text, model_id: MODEL, voice_settings: { stability: 0.0, similarity_boost: 0.8, style: 0.9, use_speaker_boost: true } }),
  });
  if (!r.ok) {
    console.log(it.id, 'ERR', r.status, (await r.text()).slice(0, 200));
    continue;
  }
  const raw = path.join(OUT, it.id + '.raw.mp3');
  fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  // Trim leading/trailing silence and normalise loudness so calls sit evenly over the game audio.
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-14:TP=-1.5', '-ar', '44100', '-b:a', '96k', path.join(OUT, it.id + '.mp3')]);
  fs.rmSync(raw);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(OUT, it.id + '.mp3')]).toString().trim();
  console.log(it.id, JSON.stringify(it.text), dur + ' s');
}
fs.writeFileSync(path.join(OUT, 'calls.json'), JSON.stringify({ voice: 'ElevenLabs "Charlie" (eleven_v3)', calls: Object.fromEntries(Object.entries(CALLS).map(([k, lines]) => [k, lines.map((text, i) => ({ id: `${k}_${i}`, text }))])) }, null, 1));
const after = await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': KEY } })).json();
console.log(`ElevenLabs after: ${after.character_count}/${after.character_limit}`);
