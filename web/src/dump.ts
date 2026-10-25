// Offline tool: run Pose Landmarker over pre-extracted video frames (exact, deterministic) and expose the landmarks.
// Used by tests/tools/dump-landmarks.ts to build gesture tuning data from the labeled clips.
import { PoseTracker } from './pose/tracker';

const params = new URLSearchParams(location.search);
const out: { status: string; frames: { t: number; people: { image: number[][]; world: number[][] }[] }[]; error?: string } = { status: 'init', frames: [] };
(window as any).__dump = out;

async function main() {
  const base = params.get('base')!; // e.g. /frames/jab_01/
  const n = Number(params.get('n'));
  const fps = Number(params.get('fps') ?? 30);
  const numPoses = Number(params.get('poses') ?? 1);
  const tracker = new PoseTracker();
  await tracker.init(numPoses, true);
  out.status = 'running';
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const blob = await (await fetch(`${base}${String(i + 1).padStart(5, '0')}.jpg`)).blob();
    const bmp = await createImageBitmap(blob);
    const f = await tracker.detect(bmp, Math.round(t * 1000) + 1);
    out.frames.push({ t, people: f.people.map((p) => ({ image: p.image.map((x) => x.map((y) => +y.toFixed(4))), world: p.world.map((x) => x.map((y) => +y.toFixed(4))) })) });
    document.getElementById('s')!.textContent = `${i + 1}/${n}`;
  }
  out.status = 'done';
}
main().catch((e) => { out.status = 'error'; out.error = String(e); });
