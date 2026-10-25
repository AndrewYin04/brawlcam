// Pose Landmarker in a module Web Worker, because detectForVideo blocks the thread it runs on.
import { PoseEngine } from './engine';
import type { WorkerIn, WorkerOut } from './types';

const engine = new PoseEngine();
let failures = 0;

function post(msg: WorkerOut) {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    try {
      const d = await engine.init(msg.numPoses, !!msg.forceCpu, self.location.origin);
      post({ type: 'ready', delegate: d });
    } catch (e) {
      post({ type: 'error', message: String((e as Error)?.message ?? e) });
    }
    return;
  }
  if (msg.type === 'numPoses') {
    await engine.setNumPoses(msg.numPoses);
    return;
  }
  if (msg.type === 'frame') {
    const bitmap = msg.bitmap;
    try {
      const r = engine.detect(bitmap, msg.ts);
      failures = 0;
      post({ type: 'result', ts: msg.ts, people: r.people, inferMs: r.inferMs, delegate: engine.delegate });
    } catch (e) {
      failures++;
      // Some browsers (older Safari) have no WebGL in workers, which MediaPipe needs even on CPU:
      // tell the main thread so it can run detection itself.
      post({ type: 'error', message: String((e as Error)?.message ?? e), fatal: failures >= 3 } as WorkerOut);
    } finally {
      bitmap.close();
    }
  }
};
