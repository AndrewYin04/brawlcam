import type { PosePerson, WorkerOut } from './types';

export interface PoseFrame {
  ts: number; // performance.now() when the frame was captured
  people: PosePerson[];
  inferMs: number;
}

/**
 * Feeds video frames to the pose worker, one frame in flight at a time,
 * and reports results. Counts detection FPS.
 */
export class PoseTracker {
  private worker: Worker;
  private busy = false;
  private running = false;
  private video: HTMLVideoElement | null = null;
  private frameTimes: number[] = [];
  delegate: 'GPU' | 'CPU' | null = null;
  fps = 0;
  lastFrame: PoseFrame | null = null;
  onFrame: ((f: PoseFrame) => void) | null = null;
  onError: ((m: string) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }

  init(numPoses: number, forceCpu = false): Promise<'GPU' | 'CPU'> {
    return new Promise((resolve, reject) => {
      const onMsg = (ev: MessageEvent<WorkerOut>) => {
        const m = ev.data;
        if (m.type === 'ready') {
          this.delegate = m.delegate;
          this.worker.removeEventListener('message', onMsg);
          this.worker.addEventListener('message', (e) => this.handle(e.data));
          resolve(m.delegate);
        } else if (m.type === 'error') {
          this.worker.removeEventListener('message', onMsg);
          reject(new Error(m.message));
        }
      };
      this.worker.addEventListener('message', onMsg);
      this.worker.postMessage({ type: 'init', numPoses, forceCpu });
    });
  }

  setNumPoses(n: number) {
    this.worker.postMessage({ type: 'numPoses', numPoses: n });
  }

  private handle(m: WorkerOut) {
    if (m.type === 'result') {
      this.busy = false;
      const now = performance.now();
      this.frameTimes.push(now);
      while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
      this.fps = this.frameTimes.length;
      this.delegate = m.delegate;
      this.lastFrame = { ts: m.ts, people: m.people, inferMs: m.inferMs };
      this.onFrame?.(this.lastFrame);
    } else if (m.type === 'error') {
      this.busy = false;
      this.onError?.(m.message);
    }
  }

  start(video: HTMLVideoElement) {
    this.video = video;
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      const v = this.video!;
      if (!this.busy && v.readyState >= 2 && v.videoWidth > 0) {
        this.busy = true;
        try {
          const ts = performance.now();
          const bitmap = await createImageBitmap(v);
          this.worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
        } catch {
          this.busy = false;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
  }
}
