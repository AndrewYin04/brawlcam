// Motion data dashboard for robotics-lab buyers: label counts (Tiger Data continuous aggregate),
// a 3D replay of one anonymized sequence, and a JSON export sample.
import * as THREE from 'three';
import { show } from '../main';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12]];
let stop: (() => void) | null = null;

export async function showMotion() {
  stop?.();
  const page = $('page');
  page.innerHTML = `
    <h2>🤖 Motion data for robotics labs</h2>
    <p class="muted">Players who opt in share labeled 3D body-landmark sequences of strikes, blocks, and dodges, labeled by the game itself. No video, images, names, or player IDs: just coordinates and a random session number.</p>
    <div class="cards" style="grid-template-columns:minmax(220px,1fr) minmax(260px,1.4fr)">
      <div class="card"><b>Labeled sequences</b><div id="mstats" class="muted">Loading…</div><b style="display:block;margin-top:12px">Continuous pose streams (Tiger Data hypertable, compressed)</b><div id="sstats" class="muted">Loading…</div></div>
      <div class="card"><b>Replay of one anonymized sequence</b><canvas id="mcanvas" style="width:100%;aspect-ratio:4/3;display:block;background:#0b0e1a;border-radius:10px;margin-top:6px"></canvas><div id="mlabel" class="muted"></div></div>
    </div>
    <div class="row"><button class="btn" id="mexport">Export JSON sample</button><button class="btn ghost" data-action="menu">Back</button></div>`;
  show('page');
  const samplePromise: Promise<any> = fetch('/api/motion/sample').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  // The export button works from the moment the page shows: a click waits for the sample instead of doing nothing
  // while the stats requests are still in flight (e2e "Motion data" clicked within 0.1 s and got no download).
  $('mexport').onclick = async () => {
    const rowsNow = (await samplePromise)?.frames ?? [];
    const blob = new Blob([JSON.stringify({ format: 'MediaPipe Pose world landmarks, meters, hip-centered; [x,y,z,visibility] x 33 per frame', sequences: rowsNow.map((r: any) => ({ label: r.label, time: r.time, frames: r.landmarks })) }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'throwhands-motion-sample.json';
    a.click();
  };
  const stats = $('mstats');
  try {
    const r = await fetch('/api/motion/stats');
    const j = r.ok ? await r.json() : null;
    stats.innerHTML = '';
    if (!j) stats.textContent = 'Stats are unavailable right now.';
    else if (!j.labels.length) stats.textContent = 'No opted-in samples yet.';
    else {
      const t = document.createElement('table');
      t.className = 'lb';
      t.id = 'mtable';
      for (const row of j.labels) {
        const tr = document.createElement('tr');
        for (const v of [row.label, `${row.samples} sequences`, `${row.sessions} sessions`]) {
          const td = document.createElement('td');
          td.textContent = String(v);
          tr.appendChild(td);
        }
        t.appendChild(tr);
      }
      stats.appendChild(t);
    }
  } catch {
    stats.textContent = 'Stats are unavailable right now.';
  }
  try {
    const r = await fetch('/api/pose-stream/stats');
    const j = r.ok ? await r.json() : null;
    const el = $('sstats');
    const mb = (b: number) => (b / 1048576).toFixed(2) + ' MB';
    if (!j) el.textContent = 'Stats are unavailable right now.';
    else {
      const ratio = j.compressedAfter > 0 ? (j.compressedBefore / j.compressedAfter).toFixed(1) + '×' : 'pending (chunks compress after an hour)';
      const lines = [
        `${j.totalFrames.toLocaleString()} frames stored (${(j.totalFrames / 15 / 60).toFixed(1)} minutes of motion)`,
        `table size ${mb(j.bytes)}`,
        `compression: ${mb(j.compressedBefore)} → ${mb(j.compressedAfter)} (${ratio})`,
        ...j.labels.map((l: any) => `${l.label}: ${l.minutes} min, ${l.sessions} sessions`),
      ];
      el.textContent = '';
      for (const t of lines) {
        const d = document.createElement('div');
        d.textContent = t;
        el.appendChild(d);
      }
    }
  } catch {
    $('sstats').textContent = 'Stats are unavailable right now.';
  }
  const sample: any = await samplePromise;
  const rows = sample?.frames ?? [];
  if (!rows.length) {
    $('mlabel').textContent = 'No sequence to replay yet.';
    return;
  }
  // Flatten into a frame list with labels.
  const frames: { label: string; lm: number[][] }[] = [];
  for (const r of rows) for (const f of r.landmarks) frames.push({ label: r.label, lm: f });
  const canvas = $<HTMLCanvasElement>('mcanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.01, 20);
  cam.position.set(1.2, 0.3, 2.4);
  cam.lookAt(0, 0, 0);
  scene.add(new THREE.GridHelper(2, 10, 0x334466, 0x223344).translateY(-0.9));
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(EDGES.length * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3dff9a }));
  scene.add(lines);
  let i = 0;
  let last = 0;
  let raf = 0;
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (t - last > 60) {
      last = t;
      const f = frames[i % frames.length];
      EDGES.forEach(([a, b], k) => {
        const A = f.lm[a] ?? [0, 0, 0];
        const B = f.lm[b] ?? [0, 0, 0];
        pos.set([A[0], -A[1], -A[2], B[0], -B[1], -B[2]], k * 6);
      });
      geo.attributes.position.needsUpdate = true;
      $('mlabel').textContent = `label: ${f.label} · frame ${(i % frames.length) + 1}/${frames.length}`;
      i++;
    }
    scene.rotation.y = Math.sin(t / 3000) * 0.6;
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(loop);
  stop = () => {
    cancelAnimationFrame(raf);
    renderer.dispose();
    stop = null;
  };
}
