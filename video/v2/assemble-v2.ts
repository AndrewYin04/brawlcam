// demo-video-v2 assembler (planner 5:10 AM): 1080p30, motion graphics from render-graphics.ts, gameplay recorded with
// the real game (video/record-scenes.ts), the user's own webcam as picture-in-picture (approved 5:20 AM), voiceover
// (ElevenLabs), announcer calls at the moment they fired, voiced Gemini roasts with their captions, CC0 music bed
// ducked under speech, burned captions, -14 LUFS. Blocks: visuals stretch to cover the block's speech.
// Usage: npx tsx video/v2/assemble-v2.ts   -> video/out/v2/throwhands-demo-v2.mp4
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'video/out/v2');
const G = path.join(ROOT, 'video/out/v2g');
const V = path.join(ROOT, 'video/out');
const WEBCAM = path.join(ROOT, 'video/out/research-s2/s2.mp4');
fs.mkdirSync(path.join(OUT, 'seg'), { recursive: true });
const FPS = 30;
const ff = (args: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'video/script.json'), 'utf8')).segments as { id: string; vo: string }[];
const voText = (id: string) => script.find((s) => s.id === id)?.vo ?? '';
const voFile = (id: string) => path.join(V, 'vo', id + '.mp3');

type Overlay = { mov: string; at: number };
type Visual =
  | { kind: 'gfx'; src: string; dur?: number }
  | { kind: 'clip'; src: string; ss: number; dur?: number; calls?: boolean; overlays?: Overlay[]; pip?: number; split?: string }
  | { kind: 'image'; src: string; dur?: number };
type Roast = { file: string; text: string; at: number };
type Block = { visuals: Visual[]; vo?: string; voAt?: number; roasts?: Roast[]; min?: number };

const roastBank: { file: string; text: string }[] = fs.existsSync(path.join(ROOT, 'video/v2/roasts.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'video/v2/roasts.json'), 'utf8')) : [];
const R = (i: number, at: number): Roast[] => (roastBank[i] ? [{ ...roastBank[i], at }] : []);
const S2A = 26.022 + 3.2, S2B = 57.0 + 3.2, UP = 31.033 + 3.2, HOOK = 27.54 + 3.2; // webcam second at each shot's frame 0

const blocks: Block[] = [
  // 1. Problem and connection (~30 s)
  { visuals: [{ kind: 'gfx', src: 'logo_open.mp4' }] },
  { vo: 'realpunch', voAt: 0.2, visuals: [{ kind: 'clip', src: 'user_upper', ss: 0.3, calls: true, pip: UP, overlays: [{ mov: 'pip_br.mov', at: 0 }] }] },
  { vo: 'logo', visuals: [{ kind: 'gfx', src: 'card_body.mp4' }] },
  { vo: 'problem', voAt: 0.1, visuals: [{ kind: 'gfx', src: 'card_nocontroller.mp4' }, { kind: 'clip', src: 'duel_side', ss: 1.0, dur: 2.6 }, { kind: 'gfx', src: 'card_friends.mp4' }, { kind: 'clip', src: 'online_p1', ss: 2.0, split: 'online_p2' }] },
  { vo: 'connect', visuals: [{ kind: 'clip', src: 'online_p1', ss: 4.6, split: 'online_p2', calls: true }] },
  // 2. Demo (~90 s)
  { visuals: [{ kind: 'gfx', src: 'title_demo.mp4' }] },
  { vo: 'circle', visuals: [{ kind: 'clip', src: 'walk_in', ss: 0.8, dur: 2.4 }, { kind: 'clip', src: 'circle', ss: 1.0 }] },
  { vo: 'hook', visuals: [{ kind: 'clip', src: 'user_s2a_side', ss: 1.2, dur: 2.6, pip: S2A }, { kind: 'clip', src: 'user_s2b_side', ss: 2.0, pip: S2B, calls: true }] },
  { vo: 'guard', visuals: [{ kind: 'clip', src: 'guard_break', ss: 0.2, calls: true, overlays: [{ mov: 'callout_guard_broken.mov', at: 1.6 }] }] },
  { vo: 'ironwall', visuals: [{ kind: 'clip', src: 'iron_wall', ss: 0.0, calls: true, overlays: [{ mov: 'callout_iron_wall.mov', at: 0.9 }] }] },
  { vo: 'cage', visuals: [{ kind: 'clip', src: 'cage_slam', ss: 0.4, calls: true, overlays: [{ mov: 'callout_super_uppercut.mov', at: 0.5 }, { mov: 'flash_3f.mov', at: 0.75 }] }] },
  { vo: 'brawl', visuals: [{ kind: 'clip', src: 'brawl', ss: 1.0, dur: 3.2, calls: true }, { kind: 'clip', src: 'brawl', ss: 6.0, calls: true }] },
  { vo: 'roasts', min: 11.5, roasts: [...R(0, 3.8), ...R(1, 7.6)], visuals: [{ kind: 'clip', src: 'user_s2b', ss: 1.0, dur: 3.8, pip: S2B }, { kind: 'clip', src: 'user_s2a', ss: 8.0, dur: 3.8, pip: S2A }, { kind: 'clip', src: 'user_s2b', ss: 9.0 }] },
  { vo: 'online', visuals: [{ kind: 'image', src: 'lobby.png', dur: 2.6 }, { kind: 'clip', src: 'online_p1', ss: 1.0, split: 'online_p2', calls: true }] },
  { vo: 'forge', visuals: [{ kind: 'image', src: 'forge.png', dur: 3.8 }, { kind: 'image', src: 'rivalry.png' }] },
  // 3. AI (~30 s)
  { visuals: [{ kind: 'gfx', src: 'title_ai.mp4' }] },
  { vo: 'ai', visuals: [{ kind: 'gfx', src: 'pipeline.mp4' }, { kind: 'clip', src: 'user_hook', ss: 0.2, dur: 4.5, pip: HOOK }, { kind: 'clip', src: 'duel_side', ss: 4.0 }] },
  // 4. Tools (~30 s)
  { visuals: [{ kind: 'gfx', src: 'title_built.mp4' }] },
  { vo: 'tools', visuals: [{ kind: 'gfx', src: 'stats.mp4' }, { kind: 'clip', src: 'user_s2a_side', ss: 9.0, dur: 4.0, pip: S2A }, { kind: 'image', src: 'leaderboard.png', dur: 3.0 }, { kind: 'clip', src: 'brawl', ss: 9.0 }] },
  { vo: 'business', visuals: [{ kind: 'image', src: 'store.png' }] },
  { vo: 'close', min: 4.8, visuals: [{ kind: 'gfx', src: 'end_card.mp4' }] },
];

const imgPath = (n: string) => (n === 'review.jpg' ? path.join(ROOT, 'video/out/review/r11/ko_sheet.jpg') : path.join(V, 'ui', n));
const natural = (v: Visual) => (v.kind === 'gfx' ? v.dur ?? dur(path.join(G, v.src)) : v.kind === 'image' ? v.dur ?? 3 : v.dur ?? Math.max(1, dur(path.join(V, v.src + '.mp4')) - v.ss));

// Plan the timeline.
type Placed = { v: Visual; start: number; d: number };
const placed: Placed[] = [];
const audio: { file: string; at: number; vol: number; kind: 'vo' | 'call' | 'roast' }[] = [];
const caps: { start: number; end: number; text: string; style: 'vo' | 'roast' }[] = [];
let T = 0;
for (const b of blocks) {
  const roastEnd = Math.max(0, ...(b.roasts ?? []).map((r) => r.at + dur(r.file) + 0.6));
  const voD = Math.max(roastEnd, b.vo ? dur(voFile(b.vo)) + (b.voAt ?? 0) + 0.35 : 0);
  const nat = b.visuals.map(natural);
  const fixed = b.visuals.slice(0, -1).reduce((a, v, i) => a + nat[i], 0);
  const lastNat = nat[nat.length - 1];
  const total = Math.max(b.min ?? 0, voD, b.visuals.length === 1 && b.visuals[0].kind === 'gfx' && !b.vo ? lastNat : fixed + Math.min(lastNat, 1.2));
  const lastD = Math.max(0.8, total - fixed);
  let t = T;
  b.visuals.forEach((v, i) => {
    const d = i === b.visuals.length - 1 ? lastD : nat[i];
    placed.push({ v, start: t, d });
    t += d;
  });
  if (b.vo) {
    const at = T + (b.voAt ?? 0);
    audio.push({ file: voFile(b.vo), at, vol: 1, kind: 'vo' });
    // Captions: the VO text in chunks of ~7 words, timed by word share.
    const words = voText(b.vo).split(/\s+/);
    const vd = dur(voFile(b.vo));
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += 7) chunks.push(words.slice(i, i + 7).join(' '));
    let c0 = at;
    for (const ch of chunks) {
      const share = (ch.split(' ').length / words.length) * vd;
      caps.push({ start: c0, end: c0 + share, text: ch, style: 'vo' });
      c0 += share;
    }
  }
  for (const r of b.roasts ?? []) {
    audio.push({ file: r.file, at: T + r.at, vol: 1, kind: 'roast' });
    caps.push({ start: T + r.at - 0.1, end: T + r.at + dur(r.file) + 0.4, text: `GEMINI: “${r.text}”`, style: 'roast' });
  }
  T = t;
}
const TOTAL = T;
console.log(`timeline ${TOTAL.toFixed(1)} s, ${placed.length} shots`);
if (process.env.PLAN_ONLY) {
  for (const p of placed) console.log(p.start.toFixed(2).padStart(7), p.d.toFixed(2).padStart(5), p.v.kind.padEnd(5), 'src' in p.v ? p.v.src : '', p.v.kind === 'clip' ? `ss ${p.v.ss}${p.v.pip != null ? ' pip ' + p.v.pip.toFixed(2) : ''}${p.v.split ? ' split' : ''}` : '');
  process.exit(0);
}

// Announcer calls from each gameplay shot's log, at the moment they fired (skipped under VO? no: they are short shouts).
// demo-video-v3 (REVIEW.md 7:30 AM, the user's list): the shots at these published ranges are re-recorded with cam=free
// (their calls come from the new recordings), and the game's calls are muted from 0:40 to 1:09.
export const V3_REPLACE: Record<number, { src: string; split?: string; ss: number; start: number; d: number }> = {
  7: { src: 'online_p1_free', split: 'online_p2_free', ss: 2.0, start: 18.6, d: 21.533333 - 18.6 },
  8: { src: 'online_p1_free', split: 'online_p2_free', ss: 5.2, start: 21.533333, d: 28.166667 - 21.533333 },
  20: { src: 'user_s2b_free', ss: 9.0, start: 76.233333, d: 80.6 - 76.233333 },
  22: { src: 'online_p1_free', split: 'online_p2_free', ss: 12.0, start: 83.2, d: 88.133333 - 83.2 },
};
const V3 = !!process.env.V3;
for (const [pi, p0] of placed.entries()) {
  const rep = V3 ? V3_REPLACE[pi] : undefined;
  const p = rep ? { ...p0, start: rep.start, d: rep.d, v: { ...(p0.v as any), src: rep.src, ss: rep.ss } } : p0;
  if (p.v.kind !== 'clip' || !p.v.calls) continue;
  const f = path.join(V, p.v.src + '.calls.json');
  if (!fs.existsSync(f)) continue;
  const ssE = rep ? rep.ss : Math.max(0, Math.min(p.v.ss, dur(path.join(V, p.v.src + '.mp4')) - p.d - 0.05));
  for (const c of JSON.parse(fs.readFileSync(f, 'utf8')) as { t: number; id: string }[]) {
    if (c.t < ssE || c.t > ssE + p.d - 0.4) continue;
    if (c.id.startsWith('filler') || c.id.startsWith('meter')) continue;
    const at = p.start + c.t - ssE;
    if (V3 && at >= 40 && at <= 69) continue; // v3: no game voice under the voiceover from 0:40 to 1:09
    audio.push({ file: path.join(ROOT, 'web/public/calls', c.id + '.mp3'), at, vol: 0.55, kind: 'call' });
  }
}

// Render each shot to a 1080p30 intermediate (video only).
const segFiles: string[] = [];
if (!V3) placed.forEach((p, i) => {
  const out = path.join(OUT, 'seg', `s${String(i).padStart(2, '0')}.mp4`);
  segFiles.push(out);
  const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', out];
  const norm = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0b0e1a,fps=${FPS},setsar=1`;
  const v = p.v;
  if (v.kind === 'gfx') {
    ff(['-i', path.join(G, v.src), '-filter_complex', `[0:v]${norm},tpad=stop_mode=clone:stop_duration=10,trim=duration=${p.d.toFixed(3)}[o]`, '-map', '[o]', ...enc]);
  } else if (v.kind === 'image') {
    // Slow push-in.
    const frames = Math.round(p.d * FPS);
    ff(['-loop', '1', '-i', imgPath(v.src), '-filter_complex', `[0:v]scale=2400:-2,${'zoompan'}=z='min(1+0.0009*on,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${FPS},trim=duration=${p.d.toFixed(3)},setsar=1[o]`, '-map', '[o]', ...enc]);
  } else {
    // Start earlier when the planned slot runs past the end of the recording (the slot length is the plan); hold the
    // last frame only if the recording is shorter than the slot.
    const srcLen = dur(path.join(V, v.src + '.mp4'));
    const ss = Math.max(0, Math.min(v.ss, srcLen - p.d - 0.05));
    const shift = ss - v.ss;
    const inputs = ['-ss', ss.toFixed(3), '-t', (p.d + 0.2).toFixed(3), '-i', path.join(V, v.src + '.mp4')];
    let f = '';
    let n = 1;
    if (v.split) {
      inputs.push('-ss', ss.toFixed(3), '-t', (p.d + 0.2).toFixed(3), '-i', path.join(V, v.split + '.mp4'));
      f += `[0:v]scale=1920:1080,crop=960:1080:480:0,setsar=1[a];[1:v]scale=1920:1080,crop=960:1080:480:0,setsar=1[b];[a][b]hstack,drawbox=x=957:y=0:w=6:h=1080:color=0xffc53d:t=fill[base];`;
      n = 2;
    } else f += `[0:v]${norm}[base];`;
    let cur = 'base';
    if (v.pip != null) {
      inputs.push('-ss', (v.pip + ss).toFixed(3), '-t', (p.d + 0.2).toFixed(3), '-i', WEBCAM);
      // Upper-body crop of the user's webcam (no room details), bordered, bottom-right.
      f += `[${n}:v]crop=560:560:360:60,scale=420:420,pad=428:428:4:4:color=0xffc53d[pip];[${cur}][pip]overlay=1436:596[pp];`;
      cur = 'pp';
      n++;
    }
    for (const o of v.overlays ?? []) {
      inputs.push('-itsoffset', Math.max(0, o.at - shift).toFixed(3), '-i', path.join(fs.existsSync(path.join(G, o.mov)) ? G : path.join(ROOT, 'video/v2/out'), o.mov));
      f += `[${cur}][${n}:v]overlay=0:0:eof_action=pass[o${n}];`;
      cur = `o${n}`;
      n++;
    }
    f += `[${cur}]tpad=stop_mode=clone:stop_duration=${(p.d + 1).toFixed(2)},trim=duration=${p.d.toFixed(3)},setpts=PTS-STARTPTS[o]`;
    ff([...inputs, '-filter_complex', f, '-map', '[o]', ...enc]);
  }
  process.stdout.write(`seg ${i} ${v.kind} ${'src' in v ? v.src : ''} ${p.d.toFixed(2)} s\n`);
});

// Concatenate the shots.
const list = path.join(OUT, 'list.txt');
fs.writeFileSync(list, segFiles.map((f) => `file '${f}'`).join('\n'));
const silent = path.join(OUT, 'video-only.mp4');
if (!V3) ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);

// Captions (ASS): VO in white, Gemini roasts in gold.
const ts = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
};
const ass = [
  '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: vo,Noto Sans Display,46,&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,1,0,0,0,100,100,0,0,1,3,1,2,120,120,64,1',
  'Style: roast,Noto Sans Display,50,&H003DC5FF,&H003DC5FF,&H00101010,&HA0000000,1,1,0,0,100,100,0,0,3,3,0,8,160,160,120,1',
  '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ...caps.map((c) => `Dialogue: 0,${ts(c.start)},${ts(c.end)},${c.style},,0,0,0,,${c.text.replace(/\n/g, ' ')}`),
].join('\n');
const assFile = path.join(OUT, 'captions.ass');
fs.writeFileSync(assFile, ass);

// Audio: music bed (ducked under speech), VO, calls, roasts; loudness -14 LUFS.
const music = path.join(ROOT, 'video/v2/music/bed.mp3');
const aIn: string[] = ['-stream_loop', '-1', '-i', music];
let af = `[0:a]atrim=0:${TOTAL.toFixed(2)},afade=t=in:d=0.3,afade=t=out:st=${(TOTAL - 2.5).toFixed(2)}:d=2.5,volume=0.32[mus];`;
const speech: string[] = [];
audio.forEach((a, i) => {
  aIn.push('-i', a.file);
  const ms = Math.max(0, Math.round(a.at * 1000));
  af += `[${i + 1}:a]aresample=48000,volume=${a.vol},adelay=${ms}|${ms}[s${i}];`;
  speech.push(`[s${i}]`);
});
af += `${speech.join('')}amix=inputs=${speech.length}:normalize=0[sp];[sp]asplit=2[sp1][sp2];`;
af += `[mus][sp1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];[duck][sp2]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`;
const mixed = path.join(OUT, 'audio.m4a');
ff([...aIn, '-filter_complex', af, '-map', '[aout]', '-t', TOTAL.toFixed(2), '-c:a', 'aac', '-b:a', '192k', mixed]);

if (V3) {
  // v3: make-v3.ts builds the video from the published v2 and the re-recorded shots, and muxes this audio.
  fs.copyFileSync(mixed, path.join(OUT, 'audio-v3.m4a'));
  fs.copyFileSync(assFile, path.join(OUT, 'captions-v3.ass'));
  console.log('v3 audio and captions written');
  process.exit(0);
}
const final = path.join(OUT, 'throwhands-demo-v2.mp4');
ff(['-i', silent, '-i', mixed, '-vf', `subtitles=${assFile}`, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', '-shortest', final]);
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ total: TOTAL, shots: placed.map((p) => ({ start: +p.start.toFixed(2), d: +p.d.toFixed(2), kind: p.v.kind, src: 'src' in p.v ? p.v.src : '' })), audio: audio.map((a) => ({ at: +a.at.toFixed(2), kind: a.kind, file: path.basename(a.file) })), captions: caps }, null, 1));
console.log('wrote', final, TOTAL.toFixed(1) + ' s');
