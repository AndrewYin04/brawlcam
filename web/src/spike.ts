// Risk spike page: camera -> Pose Landmarker (worker) -> skeleton overlay, plus a three.js render check.
import * as THREE from 'three';
import { PoseTracker } from './pose/tracker';

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const state = { status: 'starting', delegate: '', fps: 0, people: 0, landmarks: 0, renderFps: 0, frames: 0, error: '' };
(window as any).__spike = state;

const EDGES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[0,11],[0,12]];

async function main() {
  // three.js render check
  const canvas = $('gl') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101830);
  const cam = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  cam.position.set(0, 1, 4);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: 0xff5533 }));
  cube.position.y = 1;
  scene.add(cube, new THREE.HemisphereLight(0xffffff, 0x223344, 2));
  let rf: number[] = [];
  renderer.setAnimationLoop(() => {
    cube.rotation.x += 0.01; cube.rotation.y += 0.015;
    renderer.render(scene, cam);
    const now = performance.now(); rf.push(now); rf = rf.filter((t) => now - t < 1000);
    state.renderFps = rf.length; $('rfps').textContent = String(rf.length);
  });

  // camera
  const video = $('video') as HTMLVideoElement;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    state.status = 'camera-error'; state.error = String(e); $('status').textContent = 'camera error: ' + e;
    return;
  }
  state.status = 'loading-model'; $('status').textContent = 'loading model';
  const tracker = new PoseTracker();
  const numPoses = Number(params.get('poses') ?? 1);
  try {
    state.delegate = await tracker.init(numPoses, params.has('cpu'));
  } catch (e) {
    state.status = 'model-error'; state.error = String(e); $('status').textContent = String(e);
    return;
  }
  $('delegate').textContent = state.delegate;
  state.status = 'tracking'; $('status').textContent = 'tracking';
  const overlay = $('overlay') as HTMLCanvasElement;
  const ctx = overlay.getContext('2d')!;
  tracker.onError = (m) => { state.error = m; };
  tracker.onFrame = (f) => {
    state.frames++;
    state.fps = tracker.fps; state.people = f.people.length; state.landmarks = f.people[0]?.image.length ?? 0;
    $('fps').textContent = String(tracker.fps); $('people').textContent = String(f.people.length); $('ms').textContent = f.inferMs.toFixed(1);
    overlay.width = video.videoWidth; overlay.height = video.videoHeight;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const colors = ['#3cf', '#f6c'];
    f.people.forEach((p, pi) => {
      ctx.strokeStyle = colors[pi % 2]; ctx.lineWidth = 3;
      for (const [a, b] of EDGES) {
        const A = p.image[a], B = p.image[b];
        ctx.beginPath(); ctx.moveTo(A[0] * overlay.width, A[1] * overlay.height); ctx.lineTo(B[0] * overlay.width, B[1] * overlay.height); ctx.stroke();
      }
    });
  };
  tracker.start(video);
}
main();
