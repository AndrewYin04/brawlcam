// demo-video-v3 (REVIEW.md 7:30 AM, the user's edit list, authoritative): the published v2 with
//  1. the game's announcer calls muted from 0:40 to 1:09 (audio remixed from the same stems by assemble-v2.ts V3=1),
//  2. the shaky gameplay at 0:18-0:28, 1:16-1:20 and 1:23-1:28 re-recorded with the cam=free default (same lengths),
//  3. the store shot at 2:16-2:23 replaced by the new store with real skin renders (if video/out/store_v3.mp4 exists).
// Everything else is the published v2's own frames (cut at its detected shot boundaries), so the approved edit, the
// voiceover and the Gemini roast sections are unchanged. Captions are re-burned only inside the replaced ranges.
// Usage: V3=1 npx tsx video/v2/assemble-v2.ts && npx tsx video/v2/make-v3.ts -> video/out/v3/throwhands-demo-v3.mp4
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const V = path.join(ROOT, 'video/out');
const PUB = path.join(V, 'v2pub.mp4'); // the published demo-video-v2 release asset
const OUT = path.join(V, 'v3');
fs.mkdirSync(path.join(OUT, 'seg'), { recursive: true });
const ff = (args: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const enc = (out: string) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', '-an', out];

type Rep = { start: number; end: number; src?: string; split?: string; ss?: number; file?: string; what: string };
const STORE = path.join(V, 'store_v3.mp4');
const reps: Rep[] = [
  { start: 18.6, end: 21.533333, src: 'online_p1_free', split: 'online_p2_free', ss: 2.0, what: 'online 1v1 split screen (cam=free)' },
  { start: 21.533333, end: 28.166667, src: 'online_p1_free', split: 'online_p2_free', ss: 5.2, what: 'online 1v1 split screen (cam=free)' },
  { start: 76.233333, end: 80.6, src: 'user_s2b_free', ss: 9.0, what: "the user's motion driving the pink-shorts fighter, under the second Gemini roast (cam=free)" },
  { start: 83.2, end: 88.133333, src: 'online_p1_free', split: 'online_p2_free', ss: 12.0, what: 'online 1v1 split screen (cam=free)' },
  ...(fs.existsSync(STORE) ? [{ start: 136.366667, end: 143.266667, file: STORE, what: 'store with real skin renders' }] : []),
];
const TOTAL = dur(PUB);
const segs: string[] = [];
let t = 0;
const cut = (a: number, b: number) => {
  if (b - a < 0.02) return;
  const out = path.join(OUT, 'seg', `p${segs.length.toString().padStart(2, '0')}.mp4`);
  ff(['-ss', a.toFixed(3), '-t', (b - a).toFixed(3), '-i', PUB, '-vf', 'fps=30,setsar=1', ...enc(out)]);
  segs.push(out);
};
for (const r of reps) {
  cut(t, r.start);
  const d = r.end - r.start;
  const out = path.join(OUT, 'seg', `p${segs.length.toString().padStart(2, '0')}.mp4`);
  if (r.file) {
    ff(['-i', r.file, '-vf', `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0b0e1a,fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=${d.toFixed(2)},trim=duration=${d.toFixed(3)}`, ...enc(out)]);
  } else {
    const src = path.join(V, r.src + '.mp4');
    if (r.ss! + d > dur(src) + 0.05) throw new Error(`${r.src}: ${r.ss}+${d.toFixed(2)} runs past the recording`);
    const inputs = ['-ss', r.ss!.toFixed(3), '-t', (d + 0.2).toFixed(3), '-i', src];
    let f: string;
    if (r.split) {
      inputs.push('-ss', r.ss!.toFixed(3), '-t', (d + 0.2).toFixed(3), '-i', path.join(V, r.split + '.mp4'));
      f = `[0:v]scale=1920:1080,crop=960:1080:480:0,setsar=1[a];[1:v]scale=1920:1080,crop=960:1080:480:0,setsar=1[b];[a][b]hstack,drawbox=x=957:y=0:w=6:h=1080:color=0xffc53d:t=fill,fps=30,trim=duration=${d.toFixed(3)},setpts=PTS-STARTPTS[o]`;
    } else f = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,trim=duration=${d.toFixed(3)},setpts=PTS-STARTPTS[o]`;
    ff([...inputs, '-filter_complex', f, '-map', '[o]', ...enc(out)]);
  }
  segs.push(out);
  t = r.end;
}
cut(t, TOTAL);
const list = path.join(OUT, 'list.txt');
fs.writeFileSync(list, segs.map((f) => `file '${f}'`).join('\n'));
const silent = path.join(OUT, 'video-only.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);

// Captions: the published frames already carry theirs; burn the v2 caption events only inside the replaced ranges.
const ass = fs.readFileSync(path.join(V, 'v2/captions-v3.ass'), 'utf8').split('\n');
const sec = (s: string) => { const [h, m, x] = s.split(':'); return +h * 3600 + +m * 60 + +x; };
const ts = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const out: string[] = [];
for (const line of ass) {
  if (!line.startsWith('Dialogue:')) { out.push(line); continue; }
  const parts = line.split(',');
  const a = sec(parts[1]), b = sec(parts[2]);
  for (const r of reps) {
    const s0 = Math.max(a, r.start), s1 = Math.min(b, r.end);
    if (s1 - s0 > 0.04) out.push([parts[0], ts(s0), ts(s1), ...parts.slice(3)].join(','));
  }
}
const assV3 = path.join(OUT, 'captions-replaced.ass');
fs.writeFileSync(assV3, out.join('\n'));

const final = path.join(OUT, 'throwhands-demo-v3.mp4');
ff(['-i', silent, '-i', path.join(V, 'v2/audio-v3.m4a'), '-vf', `subtitles=${assV3}`, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', final]);
fs.writeFileSync(path.join(OUT, 'replaced.json'), JSON.stringify(reps.map((r) => ({ from: +r.start.toFixed(2), to: +r.end.toFixed(2), what: r.what, source: r.file ? path.basename(r.file) : `${r.src} from ${r.ss}s` })), null, 1));
console.log('wrote', final, dur(final).toFixed(2) + ' s; replaced:', reps.map((r) => `${r.start.toFixed(2)}-${r.end.toFixed(2)}`).join(', '));
