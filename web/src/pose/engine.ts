// Pose Landmarker wrapper shared by the worker and the main-thread fallback.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PosePerson } from './types';

export class PoseEngine {
  landmarker: PoseLandmarker | null = null;
  delegate: 'GPU' | 'CPU' = 'GPU';
  private lastTs = -1;

  async init(numPoses: number, forceCpu: boolean, origin: string, canvas?: HTMLCanvasElement | OffscreenCanvas): Promise<'GPU' | 'CPU'> {
    const order: ('GPU' | 'CPU')[] = forceCpu ? ['CPU'] : ['GPU', 'CPU'];
    let lastErr = '';
    // Module build inside workers (loaded with import()); classic build on the main thread (loaded with a script tag).
    const inWorker = typeof (globalThis as any).WorkerGlobalScope !== 'undefined' && self instanceof (globalThis as any).WorkerGlobalScope;
    const fileset = await FilesetResolver.forVisionTasks(new URL('/mediapipe', origin).href, inWorker);
    for (const d of order) {
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: new URL('/models/pose_landmarker_lite.task', origin).href, delegate: d },
          runningMode: 'VIDEO',
          numPoses,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          ...(canvas ? { canvas: canvas as any } : {}),
        });
        this.delegate = d;
        return d;
      } catch (e) {
        lastErr = String((e as Error)?.message ?? e);
      }
    }
    throw new Error('Pose model failed to load: ' + lastErr);
  }

  async setNumPoses(n: number) {
    if (this.landmarker) await this.landmarker.setOptions({ numPoses: n });
  }

  detect(image: ImageBitmap | HTMLVideoElement | HTMLCanvasElement, tsMs: number): { people: PosePerson[]; inferMs: number } {
    if (!this.landmarker) throw new Error('not ready');
    const ts = Math.max(tsMs, this.lastTs + 1); // VIDEO mode needs strictly increasing timestamps
    this.lastTs = ts;
    const t0 = performance.now();
    const res = this.landmarker.detectForVideo(image as any, ts);
    const people: PosePerson[] = res.landmarks.map((lm, i) => ({
      image: lm.map((p) => [p.x, p.y, p.z, p.visibility ?? 0] as [number, number, number, number]),
      world: (res.worldLandmarks[i] ?? []).map((p) => [p.x, p.y, p.z, p.visibility ?? 0] as [number, number, number, number]),
    }));
    return { people, inferMs: performance.now() - t0 };
  }
}
