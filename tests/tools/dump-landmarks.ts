// Dump per-frame pose landmarks for each clip (clips/*.mp4) into clips/landmarks/NAME.json.
// Usage: BASE_URL=http://localhost:4173 npx tsx tests/tools/dump-landmarks.ts [name ...]
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CLIPS = path.join(ROOT, 'clips');
const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const outDir = path.join(CLIPS, 'landmarks');
fs.mkdirSync(outDir, { recursive: true });

let names = process.argv.slice(2);
if (!names.length) names = fs.readdirSync(CLIPS).filter((f) => f.endsWith('.mp4')).map((f) => f.replace(/\.mp4$/, ''));
const force = process.env.FORCE === '1';
const gt = fs.existsSync(path.join(CLIPS, 'groundtruth.json')) ? JSON.parse(fs.readFileSync(path.join(CLIPS, 'groundtruth.json'), 'utf8')) : { clips: [] };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const conc = Number(process.env.CONC ?? 3);
const queue = names.filter((n) => force || !fs.existsSync(path.join(outDir, n + '.json')));
async function worker() {
  while (queue.length) {
    const name = queue.shift()!;
    const people = gt.clips.find((c: any) => c.name === name)?.people ?? 1;
    const page = await browser.newPage();
    // Extract exact frames with ffmpeg (cached), then serve them to the page.
    const fdir = path.join(CLIPS, 'frames', name);
    if (!fs.existsSync(path.join(fdir, '00001.jpg'))) {
      fs.mkdirSync(fdir, { recursive: true });
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(CLIPS, name + '.mp4'), '-vf', 'fps=30', '-q:v', '2', path.join(fdir, '%05d.jpg')]);
    }
    const nFrames = fs.readdirSync(fdir).filter((f) => f.endsWith('.jpg')).length;
    await page.route((u) => u.pathname.startsWith('/frames/'), (route) => {
      const parts = new URL(route.request().url()).pathname.split('/');
      route.fulfill({ path: path.join(CLIPS, 'frames', parts[2], parts[3]), contentType: 'image/jpeg' });
    });
    const t0 = Date.now();
    await page.goto(`${BASE}/dump.html?base=/frames/${name}/&n=${nFrames}&poses=${Math.min(2, people)}`);
    await page.waitForFunction(() => ['done', 'error'].includes((window as any).__dump?.status), null, { timeout: 600_000, polling: 1000 });
    const res = await page.evaluate(() => (window as any).__dump);
    await page.close();
    if (res.status !== 'done') { console.log(name, 'ERROR', res.error); continue; }
    fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify({ name, fps: 30, frames: res.frames }));
    const withPerson = res.frames.filter((f: any) => f.people.length).length;
    console.log(name, `${res.frames.length} frames, ${withPerson} with a person, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
await Promise.all(Array.from({ length: conc }, worker));
await browser.close();
