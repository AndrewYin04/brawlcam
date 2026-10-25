// Transcribes every announcer stock call (ElevenLabs speech-to-text) and fails any clip that says more than its line
// (e.g. the delivery tag "[shouting excitedly]" read aloud). Run after regenerating calls.
// Usage: npx tsx tests/tools/check-calls.ts [id ...]
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/public/calls/calls.json'), 'utf8')).calls as Record<string, { id: string; text: string }[]>;
const items = Object.values(manifest).flat().filter((c) => !process.argv.slice(2).length || process.argv.slice(2).includes(c.id));
const norm = (t: string) => t.toLowerCase().replace(/k\.o\./g, 'ko').replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
const LEAK = /shout|excit|announc|comment|say this|voice|tag|whisper|bracket/i;
let leaks = 0;
const failed: string[] = [];
for (const c of items) {
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([fs.readFileSync(path.join(ROOT, 'web/public/calls', c.id + '.mp3'))]), c.id + '.mp3');
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, body: form });
  const j: any = await r.json();
  const said = String(j.text ?? '');
  const want = new Set(norm(c.text).map((w) => w.replace(/'/g, '')));
  const extra = norm(said).map((w) => w.replace(/'/g, '')).filter((w) => !want.has(w) && !['oh', 'ohh', 'ohhh', 'and', 'k', 'o', 'okay'].includes(w));
  const leak = LEAK.test(said) || extra.length > 1;
  if (leak) {
    leaks++;
    failed.push(c.id);
  }
  console.log(`${leak ? 'LEAK' : 'ok  '} ${c.id.padEnd(18)} want "${c.text}"  heard "${said}"${extra.length ? '  extra: ' + extra.join(' ') : ''}`);
}
console.log(`\n${leaks}/${items.length} clips say more than their line${failed.length ? ': ' + failed.join(' ') : ''}`);
if (leaks) process.exitCode = 1;
