// demo-video-v4 (REVIEW.md 10:05 AM: v3's stitching was sloppy). Same as make-v3.ts, plus:
//  - the moves section goes in at the guard-break -> Iron Wall cut (published 50.633 s), and the guard-break shot's
//    frozen tail (49.9-50.633, a padded segment in v2) is dropped; the audio plan inserts at 49.99 (assemble-v2.ts V4=1),
//    so the Iron Wall VO now follows the moves VO instead of playing under it;
//  - the Iron Wall shot (published 50.633-58.167, whose last 2.5 s were a frozen frame in v2) is re-rendered from its
//    recording with its callout;
//  - the moves shots are 2.6 / 3.4 / 2.7 s.
// Usage: V4=1 V4_INS=7.967 V4_VO_AT=50.1 npx tsx video/v2/assemble-v2.ts && npx tsx video/v2/make-v4.ts
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
// V5=1 (REVIEW.md 10:54 AM): the same build with only the Shoulder Throw shot re-recorded with the new animation.
const V5 = !!process.env.V5;
const OUT = path.join(V, V5 ? 'v5' : 'v4');
fs.mkdirSync(path.join(OUT, 'seg'), { recursive: true });
const ff = (args: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const enc = (out: string) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', '-an', out];

type Rep = { start: number; end: number; src?: string; split?: string; ss?: number; file?: string; what: string; callout?: string; calloutAt?: number; srcDur?: number };
const STORE = path.join(V, 'store_v3.mp4');
const reps: Rep[] = [
  // The recording's game camera swings overhead from 6.55 s, so the shot plays 0-6.55 s at 0.87x to fill its 7.53 s slot.
  { start: 50.633333, end: 58.166667, src: 'iron_wall', ss: 0.067, srcDur: 6.483, callout: 'callout_iron_wall.mov', calloutAt: 0.9, what: 'Iron Wall shot re-rendered from its recording (v2 froze its last 2.5 s), 0-6.55 s at 0.87x' } as Rep,
  { start: 18.6, end: 21.533333, src: 'online_p1_free', split: 'online_p2_free', ss: 2.0, what: 'online 1v1 split screen (cam=free)' },
  { start: 21.533333, end: 28.166667, src: 'online_p1_free', split: 'online_p2_free', ss: 5.2, what: 'online 1v1 split screen (cam=free)' },
  { start: 76.233333, end: 80.6, src: 'user_s2b_free2', ss: 8.6, what: "the user's motion driving the pink-shorts fighter, under the second Gemini roast (cam=free)" },
  { start: 83.2, end: 88.133333, src: 'online_p1_free', split: 'online_p2_free', ss: 12.0, what: 'online 1v1 split screen (cam=free)' },
  ...(fs.existsSync(STORE) ? [{ start: 136.366667, end: 143.266667, file: STORE, what: 'store with real skin renders' }] : []),
];
reps.sort((a, b) => a.start - b.start);
// Moves section (REVIEW.md 7:45 AM) inserted after the guard-break shot (published cut at 50.633 s); its length matches
// the audio plan's shift (assemble-v2.ts V3=1 writes v3-plan.json).
const plan = JSON.parse(fs.readFileSync(path.join(V, 'v2/v4-plan.json'), 'utf8')) as { ins: number; voAt: number; voDur: number };
const CUT_FROM = 49.9, INS_AT = 50.633333; // published [49.9, 50.633) is the frozen guard-break tail: dropped
const M = 8.7; // moves section length in the video
const INS = M - (INS_AT - CUT_FROM); // net shift of everything after; must equal the audio plan's shift
if (Math.abs(INS - plan.ins) > 0.002) throw new Error(`video shift ${INS.toFixed(3)} != audio plan ${plan.ins}`);
if (Math.abs(plan.voAt - (CUT_FROM + 0.2)) > 0.01) throw new Error(`moves VO at ${plan.voAt}, expected ${CUT_FROM + 0.2}`);
const GRAPPLE_BETA = !process.env.GRAPPLE_DEFAULT; // caption the grappling shots "Grappling (beta)" unless it ships on by default
const VO2 = path.join(ROOT, 'video/v2/out');
const W0 = (n: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'clips/landmarks', n + '.json'), 'utf8')).sourceVideoStart + 3.2;
const WEBCAM = path.join(V, 'research-s2/s2.mp4');
const insert = [
  { src: 'v3_kick', ss: 0.8, d: 2.6, callout: 'callout_kick.mov', at: 0.2 },
  { src: 'v3_grab', ss: 0.6, d: 3.4, callout: 'callout_grabknee.mov', at: 0.3, pip: W0('user_grab') },
  { src: V5 ? 'v5_throw' : 'v3_throw', ss: 1.2, d: +(M - 6.0).toFixed(3), callout: 'callout_throw.mov', at: 0.2 },
];
const TOTAL = dur(PUB);
const outT = (pubT: number) => (pubT >= INS_AT - 0.001 ? pubT + INS : pubT); // published time -> v4 time (pub < 49.9 unchanged)
const segs: string[] = [];
let t = 0;
const cut = (a: number, b: number) => {
  if (b - a < 0.02) return;
  const out = path.join(OUT, 'seg', `p${segs.length.toString().padStart(2, '0')}.mp4`);
  ff(['-ss', a.toFixed(3), '-t', (b - a).toFixed(3), '-i', PUB, '-vf', 'fps=30,setsar=1', ...enc(out)]);
  segs.push(out);
};
const renderInsert = () => {
  for (const m of insert) {
    const out = path.join(OUT, 'seg', `p${segs.length.toString().padStart(2, '0')}.mp4`);
    const inputs = ['-ss', m.ss.toFixed(3), '-t', (m.d + 0.2).toFixed(3), '-i', path.join(V, m.src + '.mp4')];
    let f = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1[b0];`;
    let cur = 'b0', n = 1;
    if (m.pip != null) {
      inputs.push('-ss', (m.pip + m.ss).toFixed(3), '-t', (m.d + 0.2).toFixed(3), '-i', WEBCAM);
      f += `[${n}:v]crop=560:560:360:60,scale=420:420,pad=428:428:4:4:color=0xffc53d[pip];[${cur}][pip]overlay=1436:596[pp];`;
      cur = 'pp';
      n++;
    }
    inputs.push('-itsoffset', m.at.toFixed(3), '-i', path.join(VO2, m.callout));
    f += `[${cur}][${n}:v]overlay=0:0:eof_action=pass[co];[co]trim=duration=${m.d.toFixed(3)},setpts=PTS-STARTPTS[o]`;
    ff([...inputs, '-filter_complex', f, '-map', '[o]', ...enc(out)]);
    segs.push(out);
  }
};
let inserted = false;
for (const r of reps) {
  if (!inserted && r.start >= INS_AT - 0.001) {
    cut(t, CUT_FROM);
    renderInsert();
    t = INS_AT;
    inserted = true;
  }
  cut(t, r.start);
  const d = r.end - r.start;
  const out = path.join(OUT, 'seg', `p${segs.length.toString().padStart(2, '0')}.mp4`);
  if (r.file) {
    ff(['-i', r.file, '-vf', `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0b0e1a,fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=${d.toFixed(2)},trim=duration=${d.toFixed(3)}`, ...enc(out)]);
  } else {
    const src = path.join(V, r.src + '.mp4');
    if (r.ss! + (r.srcDur ?? d) > dur(src) + 0.05) throw new Error(`${r.src}: ${r.ss}+${d.toFixed(2)} runs past the recording`);
    const inputs = ['-ss', r.ss!.toFixed(3), '-t', (r.srcDur ?? d + 0.2).toFixed(3), '-i', src];
    let f: string;
    if (r.split) {
      inputs.push('-ss', r.ss!.toFixed(3), '-t', (d + 0.2).toFixed(3), '-i', path.join(V, r.split + '.mp4'));
      f = `[0:v]scale=1920:1080,crop=960:1080:480:0,setsar=1[a];[1:v]scale=1920:1080,crop=960:1080:480:0,setsar=1[b];[a][b]hstack,drawbox=x=957:y=0:w=6:h=1080:color=0xffc53d:t=fill,fps=30,trim=duration=${d.toFixed(3)},setpts=PTS-STARTPTS[o]`;
    } else if (r.callout) {
      inputs.push('-itsoffset', r.calloutAt!.toFixed(3), '-i', path.join(V, 'v2g', r.callout));
      const k = r.srcDur ? (d / r.srcDur).toFixed(4) : '1';
      f = `[0:v]setpts=${k}*(PTS-STARTPTS),scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=0.1[b0];[b0][1:v]overlay=0:0:eof_action=pass,trim=duration=${d.toFixed(3)},setpts=PTS-STARTPTS[o]`;
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
const ass = fs.readFileSync(path.join(V, 'v2/captions-v4.ass'), 'utf8').split('\n');
const sec = (s: string) => { const [h, m, x] = s.split(':'); return +h * 3600 + +m * 60 + +x; };
const ts = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const out: string[] = [];
for (const line of ass) {
  if (!line.startsWith('Dialogue:')) { out.push(line); continue; }
  const parts = line.split(',');
  const a = sec(parts[1]), b = sec(parts[2]);
  const ranges = [...reps.map((r) => [outT(r.start), outT(r.start) + (r.end - r.start)]), [CUT_FROM, CUT_FROM + M]];
  for (const [ra, rb] of ranges) {
    const s0 = Math.max(a, ra), s1 = Math.min(b, rb);
    if (s1 - s0 > 0.04) out.push([parts[0], ts(s0), ts(s1), ...parts.slice(3)].join(','));
  }
}
if (GRAPPLE_BETA) out.push(`Dialogue: 1,${ts(CUT_FROM + 2.6)},${ts(CUT_FROM + M)},vo,,0,0,0,,{\\an7\\pos(60,100)\\fs40}GRAPPLING (BETA)`);
const assV3 = path.join(OUT, 'captions-replaced.ass');
fs.writeFileSync(assV3, out.join('\n'));

const final = path.join(OUT, V5 ? 'throwhands-demo-v5.mp4' : 'throwhands-demo-v4.mp4');
ff(['-i', silent, '-i', path.join(V, 'v2/audio-v4.m4a'), '-vf', `subtitles=${assV3}`, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', '-shortest', final]);
fs.writeFileSync(path.join(OUT, 'replaced.json'), JSON.stringify(reps.map((r) => ({ from: +r.start.toFixed(2), to: +r.end.toFixed(2), what: r.what, source: r.file ? path.basename(r.file) : `${r.src} from ${r.ss}s` })), null, 1));
console.log('wrote', final, dur(final).toFixed(2) + ' s; replaced:', reps.map((r) => `${r.start.toFixed(2)}-${r.end.toFixed(2)}`).join(', '));
