// Pose Landmarker in a module Web Worker, because detectForVideo blocks the thread it runs on.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { WorkerIn, WorkerOut, PosePerson } from './types';

let landmarker: PoseLandmarker | null = null;
let delegate: 'GPU' | 'CPU' = 'GPU';
let lastTs = -1;

function post(msg: WorkerOut, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

async function create(numPoses: number, want: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(new URL('/mediapipe', self.location.origin).href, true);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: new URL('/models/pose_landmarker_lite.task', self.location.origin).href,
      delegate: want,
    },
    runningMode: 'VIDEO',
    numPoses,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    const order: ('GPU' | 'CPU')[] = msg.forceCpu ? ['CPU'] : ['GPU', 'CPU'];
    let lastErr = '';
    for (const d of order) {
      try {
        landmarker = await create(msg.numPoses, d);
        delegate = d;
        post({ type: 'ready', delegate });
        return;
      } catch (e) {
        lastErr = String((e as Error)?.message ?? e);
      }
    }
    post({ type: 'error', message: 'Pose model failed to load: ' + lastErr });
    return;
  }
  if (msg.type === 'numPoses') {
    if (landmarker) await landmarker.setOptions({ numPoses: msg.numPoses });
    return;
  }
  if (msg.type === 'frame') {
    const bitmap = msg.bitmap;
    if (!landmarker) {
      bitmap.close();
      return;
    }
    // Timestamps must strictly increase for VIDEO mode.
    const ts = Math.max(msg.ts, lastTs + 1);
    lastTs = ts;
    const t0 = performance.now();
    try {
      const res = landmarker.detectForVideo(bitmap, ts);
      const people: PosePerson[] = res.landmarks.map((lm, i) => ({
        image: lm.map((p) => [p.x, p.y, p.z, p.visibility ?? 0] as [number, number, number, number]),
        world: (res.worldLandmarks[i] ?? []).map((p) => [p.x, p.y, p.z, p.visibility ?? 0] as [number, number, number, number]),
      }));
      post({ type: 'result', ts: msg.ts, people, inferMs: performance.now() - t0, delegate });
    } catch (e) {
      post({ type: 'error', message: String((e as Error)?.message ?? e) });
    } finally {
      bitmap.close();
    }
  }
};
