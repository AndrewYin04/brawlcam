// Word timings for each voiceover file (ElevenLabs speech-to-text, word timestamps), so burned captions follow the
// speech instead of a word-count estimate. Writes video/out/vo/<id>.words.json. Usage: npx tsx video/v2/vo-words.ts id...
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
for (const id of process.argv.slice(2)) {
  const f = path.join(ROOT, 'video/out/vo', id + '.mp3');
  const out = path.join(ROOT, 'video/out/vo', id + '.words.json');
  if (fs.existsSync(out)) continue;
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  fd.append('timestamps_granularity', 'word');
  fd.append('file', new Blob([fs.readFileSync(f)]), 'a.mp3');
  const r = await (await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, body: fd })).json();
  const words = (r.words ?? []).filter((w: any) => w.type === 'word').map((w: any) => ({ text: w.text, start: w.start, end: w.end }));
  fs.writeFileSync(out, JSON.stringify(words));
  console.log(id, words.length, 'words', words.slice(0, 3).map((w: any) => `${w.text}@${w.start}`).join(' '));
}
