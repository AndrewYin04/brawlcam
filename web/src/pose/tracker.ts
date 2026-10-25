import type { PosePerson, WorkerOut } from './types';
import { PoseEngine } from './engine';

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

  /** 'main' = detection runs on the main thread (fallback when the worker cannot run MediaPipe). */
  mode: 'worker' | 'main' = 'worker';
  private mainEngine: PoseEngine | null = null;
  private numPoses = 1;
  private forceCpu = false;
  private switching = false;

  async init(numPoses: number, forceCpu = false): Promise<'GPU' | 'CPU'> {
    this.numPoses = numPoses;
    this.forceCpu = forceCpu;
    if (new URLSearchParams(location.search).has('mainpose')) return this.switchToMain();
    try {
      return await this.initWorker(numPoses, forceCpu);
    } catch {
      return this.switchToMain();
    }
  }

  private async switchToMain(): Promise<'GPU' | 'CPU'> {
    if (this.mainEngine) return this.mainEngine.delegate;
    this.switching = true;
    try {
      this.worker.terminate();
    } catch {}
    const eng = new PoseEngine();
    const d = await eng.init(this.numPoses, this.forceCpu, location.origin);
    this.mainEngine = eng;
    this.mode = 'main';
    this.delegate = d;
    this.switching = false;
    this.busy = false;
    return d;
  }

  private initWorker(numPoses: number, forceCpu = false): Promise<'GPU' | 'CPU'> {
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

  /** One-shot detection for offline tools (do not mix with start()). */
  detect(bitmap: ImageBitmap, ts: number): Promise<PoseFrame> {
    return new Promise((resolve, reject) => {
      const prev = this.onFrame;
      const prevErr = this.onError;
      this.onFrame = (f) => {
        this.onFrame = prev;
        this.onError = prevErr;
        resolve(f);
      };
      this.onError = (m) => {
        this.onFrame = prev;
        this.onError = prevErr;
        reject(new Error(m));
      };
      this.busy = true;
      this.submit(bitmap, ts);
    });
  }

  setNumPoses(n: number) {
    this.numPoses = n;
    if (this.mainEngine) void this.mainEngine.setNumPoses(n);
    else this.worker.postMessage({ type: 'numPoses', numPoses: n });
  }

  /** Main-thread detection (fallback mode). */
  private runMain(bitmap: ImageBitmap, ts: number) {
    try {
      const r = this.mainEngine!.detect(bitmap, ts);
      this.handle({ type: 'result', ts, people: r.people, inferMs: r.inferMs, delegate: this.mainEngine!.delegate });
    } catch (e) {
      this.handle({ type: 'error', message: String((e as Error)?.message ?? e) });
    } finally {
      bitmap.close();
    }
  }

  /** Send a frame to whichever engine is active. */
  private submit(bitmap: ImageBitmap, ts: number) {
    this.stats.submits++;
    if (this.switching) {
      bitmap.close();
      this.busy = false;
      return;
    }
    if (this.mode === 'main') {
      // Yield first so rendering is not starved.
      setTimeout(() => this.runMain(bitmap, ts), 0);
    } else this.worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
  }

  private handle(m: WorkerOut) {
    if (m.type === 'result') {
      this.stats.results++;
      this.busy = false;
      const now = performance.now();
      this.frameTimes.push(now);
      while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
      this.fps = this.frameTimes.length;
      this.delegate = m.delegate;
      this.lastFrame = { ts: m.ts, people: m.people, inferMs: m.inferMs };
      this.onFrame?.(this.lastFrame);
    } else if (m.type === 'error') {
      this.stats.errors++;
      this.busy = false;
      this.onError?.(m.message);
      if (m.fatal && this.mode === 'worker') void this.switchToMain();
    }
  }

  start(video: HTMLVideoElement) {
    this.video = video;
    this.running = true;
    const track = (video.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    const MSTP = (globalThis as any).MediaStreamTrackProcessor;
    if (track && MSTP && !new URLSearchParams(location.search).has('novideoframe')) {
      this.startProcessor(new MSTP({ track }));
      return;
    }
    // Timer-driven (not requestAnimationFrame), so pose rate is independent of render rate.
    let lastVideoTime = -1;
    let lastSubmit = 0;
    const tick = async () => {
      if (!this.running) return;
      const v = this.video!;
      const now = performance.now();
      // Some engines (WebKit) do not advance currentTime for live camera streams: also grab every 40 ms.
      if (!this.busy && v.readyState >= 2 && v.videoWidth > 0 && (v.currentTime !== lastVideoTime || now - lastSubmit > 40)) {
        lastVideoTime = v.currentTime;
        lastSubmit = now;
        this.busy = true;
        try {
          const ts = performance.now();
          this.stats.grabs++;
          const bitmap = await this.grab(v);
          this.submit(bitmap, ts);
        } catch (e) {
          this.stats.grabErrors++;
          this.stats.lastGrabError = String((e as Error)?.message ?? e).slice(0, 120);
          this.busy = false;
        }
      }
      setTimeout(tick, this.busy ? 4 : 8);
    };
    tick();
  }

  /** Chrome: read VideoFrames directly from the camera track (independent of page rendering). */
  private async startProcessor(proc: { readable: ReadableStream<VideoFrame> }) {
    this.usingProcessor = true;
    const reader = proc.readable.getReader();
    while (this.running) {
      const { done, value: frame } = await reader.read();
      if (done || !frame) break;
      if (this.busy) {
        frame.close();
        continue;
      }
      this.busy = true;
      try {
        const ts = performance.now();
        const w = Math.min(480, frame.displayWidth);
        const h = Math.round((frame.displayHeight * w) / frame.displayWidth);
        const bitmap = await createImageBitmap(frame, { resizeWidth: w, resizeHeight: h });
        this.submit(bitmap, ts);
      } catch {
        this.busy = false;
      } finally {
        frame.close();
      }
    }
    reader.releaseLock();
  }

  usingProcessor = false;
  /** Pipeline counters (diagnostics, shown to tests). */
  stats = { grabs: 0, grabErrors: 0, submits: 0, results: 0, errors: 0, lastGrabError: '' };
  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  /** CPU-side frame grab (480 px wide max), so capture never waits on a busy GPU process. */
  private async grab(v: HTMLVideoElement): Promise<ImageBitmap> {
    const scale = Math.min(1, 480 / v.videoWidth);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx2d = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx2d!.drawImage(v, 0, 0, w, h);
    return createImageBitmap(this.canvas);
  }

  stop() {
    this.running = false;
  }
}
