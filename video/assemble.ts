// Assembles the demo video from rendered shots, UI captures, title cards, and the ElevenLabs voiceover.
// Output: video/out/throwhands-demo.mp4 (1280x720, 30 fps, H.264 + AAC) with burned-in captions.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'video/out');
const SEG = path.join(OUT, 'segments');
fs.mkdirSync(SEG, { recursive: true });
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'video/script.json'), 'utf8'));
const ff = (args: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

const W = 1280, H = 720, FPS = 30;
const VENC = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '19', '-r', String(FPS)];
const FONT = process.env.FONT ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

/** Captions: split the line into chunks of ~7 words, timed by length. Returns drawtext filters. */
function captionFilters(text: string, start: number, length: number) {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 7) chunks.push(words.slice(i, i + 7).join(' '));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let t = start;
  return chunks.map((c) => {
    const d = (c.length / total) * length;
    const esc = c.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%').replace(/,/g, '\\,');
    // End each chunk a few ms early so two captions never share a frame.
    const f = `drawtext=fontfile=${FONT}:text='${esc}':fontcolor=white:fontsize=34:borderw=3:bordercolor=black@0.85:x=(w-text_w)/2:y=h-66:enable='between(t,${t.toFixed(2)},${(t + d - 0.04).toFixed(2)})'`;
    t += d;
    return f;
  });
}

function visualClip(visual: string, length: number, outFile: string, startOffset = 0) {
  if (visual.includes('|')) {
    // Split the segment evenly between several visuals.
    const parts = visual.split('|');
    const each = +(length / parts.length).toFixed(2);
    const files = parts.map((v, i) => {
      const f = outFile.replace(/\.mp4$/, `_p${i}.mp4`);
      visualClip(v, i === parts.length - 1 ? +(length - each * (parts.length - 1)).toFixed(2) : each, f);
      return f;
    });
    const lst = outFile.replace(/\.mp4$/, '_list.txt');
    fs.writeFileSync(lst, files.map((f) => `file '${f}'`).join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', outFile]);
    return;
  }
  const [kind, id] = visual.split(':');
  if (kind === 'shot') {
    if (id === 'online_split') {
      const a = path.join(OUT, 'online_p1.mp4');
      const b = path.join(OUT, 'online_p2.mp4');
      const label = (txt: string) => `drawtext=fontfile=${FONT}:text='${txt}':fontcolor=white:fontsize=26:box=1:boxcolor=black@0.55:boxborderw=8:x=16:y=16`;
      ff(['-stream_loop', '-1', '-i', a, '-stream_loop', '-1', '-i', b, '-filter_complex',
        `[0:v]scale=632:356,${label('Maya’s screen')}[l];[1:v]scale=632:356,${label('Leo’s screen')}[r];color=c=0x070912:s=${W}x${H}:r=${FPS}[bg];[bg][l]overlay=8:182[t];[t][r]overlay=640:182,trim=duration=${length}[v]`,
        '-map', '[v]', '-t', String(length), ...VENC, outFile]);
      return;
    }
    const src = path.join(OUT, `${id.replace(/_alt$/, '')}.mp4`);
    const offset = startOffset || (id.endsWith('_alt') ? Math.max(0, dur(src) - length) : 0);
    ff(['-stream_loop', '-1', '-ss', String(offset), '-i', src, '-t', String(length), '-vf', `scale=${W}:${H},setsar=1`, ...VENC, outFile]);
    return;
  }
  // Stills (title cards, UI captures): slow zoom in.
  const img = kind === 'card' ? path.join(OUT, 'cards', id + '.png') : path.join(OUT, 'ui', id + '.png');
  const frames = Math.ceil(length * FPS);
  ff(['-loop', '1', '-i', img, '-vf', `scale=${W * 2}:${H * 2},zoompan=z='min(1+0.0006*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}`, '-t', String(length), ...VENC, outFile]);
}

const parts: string[] = [];
const audioParts: string[] = [];
let n = 0;
for (const seg of script.segments) {
  const vo = path.join(OUT, 'vo', seg.id + '.mp3');
  const voLen = dur(vo);
  const pad = (seg.section === 'demo' ? 0.9 : seg.id === 'close' ? 2.5 : 0.45) + (seg.hold ?? 0);
  const length = +(voLen + pad).toFixed(2);
  const raw = path.join(SEG, `${String(n).padStart(2, '0')}_${seg.id}_raw.mp4`);
  const done = path.join(SEG, `${String(n).padStart(2, '0')}_${seg.id}.mp4`);
  visualClip(seg.visual, length, raw, seg.offset ?? 0);
  const caps = captionFilters(seg.vo, 0.15, voLen);
  // Gameplay segments: the game's own announcer calls at the frames it fired them, plus a quiet crowd bed.
  const inputs = ['-i', raw, '-i', vo];
  const mixes = ['[1:a]adelay=150|150,apad,atrim=0:' + length + '[vo]'];
  const labels = ['[vo]'];
  if (seg.calls && seg.visual.startsWith('shot:')) {
    const shot = seg.visual.slice(5);
    const cf = path.join(OUT, `${shot}.calls.json`);
    const off = seg.offset ?? 0;
    const calls: { t: number; id: string }[] = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : [];
    for (const c of calls.filter((c) => c.t >= off && c.t < off + length - 0.6)) {
      const k = inputs.length / 2;
      inputs.push('-i', path.join(ROOT, 'web/public/calls', c.id + '.mp3'));
      const ms = Math.round((c.t - off) * 1000);
      mixes.push(`[${k}:a]volume=0.55,adelay=${ms}|${ms},apad,atrim=0:${length}[c${k}]`);
      labels.push(`[c${k}]`);
    }
    inputs.push('-f', 'lavfi', '-i', `anoisesrc=color=brown:amplitude=0.5:d=${length}`);
    const k = inputs.length / 2 - 1;
    mixes.push(`[${k}:a]bandpass=f=650:width_type=o:w=1.5,volume=0.22,afade=t=in:d=0.4,afade=t=out:st=${(length - 0.4).toFixed(2)}:d=0.4[crowd]`);
    labels.push('[crowd]');
  }
  const amix = labels.length > 1 ? `${mixes.join(';')};${labels.join('')}amix=inputs=${labels.length}:duration=first:normalize=0[a]` : `${mixes[0].replace('[vo]', '[a]')}`;
  ff([...inputs, '-filter_complex', `[0:v]${caps.join(',')},fade=t=in:st=0:d=0.2,fade=t=out:st=${(length - 0.2).toFixed(2)}:d=0.2[v];${amix}`, '-map', '[v]', '-map', '[a]', ...VENC, '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-t', String(length), done]);
  parts.push(done);
  audioParts.push(vo);
  console.log('segment', seg.id, length.toFixed(1), 's');
  n++;
}

// Concatenate segments.
const list = path.join(SEG, 'list.txt');
fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
const joined = path.join(OUT, 'joined.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
const total = dur(joined);

// Background beat, synthesized here (120 BPM kick + hats), mixed well under the voice.
const beat = path.join(OUT, 'beat.wav');
ff(['-f', 'lavfi', '-i', `aevalsrc='0.55*sin(2*PI*(52+90*exp(-25*mod(t,0.5)))*mod(t,0.5))*exp(-9*mod(t,0.5))+0.06*(random(0)-0.5)*exp(-60*mod(t+0.25,0.5))|0.55*sin(2*PI*(52+90*exp(-25*mod(t,0.5)))*mod(t,0.5))*exp(-9*mod(t,0.5))+0.06*(random(1)-0.5)*exp(-60*mod(t+0.25,0.5))':s=44100:d=${total.toFixed(2)}`, beat]);
const final = path.join(OUT, 'throwhands-demo.mp4');
ff(['-i', joined, '-i', beat, '-filter_complex', `[1:a]volume=0.16,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[b];[0:a][b]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', final]);
console.log('wrote', final, total.toFixed(1), 's');
