// Turns pose frames into per-player game input. Handles one or two people on one camera.
import { PoseTracker, type PoseFrame } from '../pose/tracker';
import { GestureRecognizer, type GestureOutput } from '../../../shared/gestures';
import type { PosePerson } from '../pose/types';
import { PeopleAssigner } from '../../../shared/assign';
export { PeopleAssigner };

const EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12]];
const COLORS = ['#ff3d6e', '#33b5ff'];

export class PoseInput {
  tracker = new PoseTracker();
  recognizers: GestureRecognizer[] = [];
  assigner: PeopleAssigner<PosePerson>;
  latest: GestureOutput[] = [];
  private pendingActions: GestureOutput['actions'][] = [];
  lastFrame: PoseFrame | null = null;
  lastPeople: (PosePerson | null)[] = [];
  onUpdate: (() => void) | null = null;
  skeleton: CanvasRenderingContext2D | null = null;
  ready = false;
  private t0 = performance.now();

  constructor(public players: number) {
    this.assigner = new PeopleAssigner<PosePerson>(players);
    this.setPlayers(players);
  }

  setPlayers(n: number) {
    this.players = n;
    this.assigner = new PeopleAssigner<PosePerson>(n);
    this.recognizers = Array.from({ length: n }, (_, i) => this.recognizers[i] ?? new GestureRecognizer());
    this.recognizers.length = n;
    this.latest = this.recognizers.map(() => ({ present: false, actions: [], blocking: false, xshield: false, move: [0, 0], turn: 0, legs: false, joints: null }));
    this.pendingActions = this.recognizers.map(() => []);
    if (this.ready) this.tracker.setNumPoses(n);
  }

  async init(forceCpu: boolean) {
    const d = await this.tracker.init(this.players, forceCpu);
    this.ready = true;
    this.tracker.onFrame = (f) => this.handle(f);
    return d;
  }

  start(video: HTMLVideoElement) {
    this.tracker.start(video);
  }

  private handle(f: PoseFrame) {
    this.lastFrame = f;
    const t = (f.ts - this.t0) / 1000;
    const people = this.assigner.assign(f.people, t);
    this.lastPeople = people;
    for (let i = 0; i < this.players; i++) {
      const p = people[i];
      const out = this.recognizers[i].update(p ? { t, world: p.world, image: p.image } : null, t);
      this.latest[i] = out;
      this.pendingActions[i].push(...out.actions);
    }
    this.drawSkeleton(people);
    this.onUpdate?.();
  }

  /** Actions detected since the last call, per player. */
  takeActions(i: number) {
    const a = this.pendingActions[i] ?? [];
    this.pendingActions[i] = [];
    return a;
  }

  private drawSkeleton(people: (PosePerson | null)[]) {
    const ctx = this.skeleton;
    if (!ctx) return;
    const c = ctx.canvas;
    if (c.width !== 320) {
      c.width = 320;
      c.height = 240;
    }
    ctx.clearRect(0, 0, c.width, c.height);
    people.forEach((p, i) => {
      if (!p) return;
      ctx.strokeStyle = COLORS[i % 2];
      ctx.lineWidth = 3;
      for (const [a, b] of EDGES) {
        const A = p.image[a];
        const B = p.image[b];
        if (A[3] < 0.3 || B[3] < 0.3) continue;
        ctx.beginPath();
        ctx.moveTo(A[0] * c.width, A[1] * c.height);
        ctx.lineTo(B[0] * c.width, B[1] * c.height);
        ctx.stroke();
      }
    });
  }
}
