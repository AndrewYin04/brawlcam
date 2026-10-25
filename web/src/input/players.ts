// Turns pose frames into per-player game input. Handles one or two people on one camera.
import { PoseTracker, type PoseFrame } from '../pose/tracker';
import { GestureRecognizer, type GestureOutput } from '../../../shared/gestures';
import type { PosePerson } from '../pose/types';

const EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12]];
const COLORS = ['#ff3d6e', '#33b5ff'];

interface Track {
  cx: number; // image x of the shoulder midpoint (raw, unmirrored)
  sig: number[]; // body proportion signature
  lastSeen: number;
}

/**
 * Keeps each person attached to the same player slot across frames, even when they cross.
 * Slot 0 is the person standing on the left as they see themselves in the mirrored preview,
 * which is the right side of the raw camera image.
 */
export class PeopleAssigner {
  tracks: (Track | null)[];
  swaps = 0;
  constructor(public slots: number) {
    this.tracks = Array.from({ length: slots }, () => null);
  }

  private static sig(p: PosePerson): number[] {
    const w = p.world;
    const d = (a: number, b: number) => Math.hypot(w[a][0] - w[b][0], w[a][1] - w[b][1], w[a][2] - w[b][2]);
    const sw = d(11, 12) || 0.3;
    return [d(11, 23) / sw, d(11, 13) / sw, d(13, 15) / sw, d(0, 11) / sw];
  }

  assign(people: PosePerson[], t: number): (PosePerson | null)[] {
    const out: (PosePerson | null)[] = Array.from({ length: this.slots }, () => null);
    if (!people.length) return out;
    const cx = (p: PosePerson) => (p.image[11][0] + p.image[12][0]) / 2;
    if (this.slots === 1) {
      // Single player: the most prominent person (largest shoulder width).
      const best = [...people].sort((a, b) => Math.abs(b.image[11][0] - b.image[12][0]) - Math.abs(a.image[11][0] - a.image[12][0]))[0];
      out[0] = best;
      return out;
    }
    const cand = people.slice(0, this.slots);
    const fresh = this.tracks.every((tr) => !tr || t - tr.lastSeen > 2.5);
    let order: number[]; // order[i] = slot for cand[i]
    if (fresh) {
      // Initial assignment by side: mirrored-left (raw right, larger x) is slot 0.
      const sorted = cand.map((p, i) => ({ i, x: cx(p) })).sort((a, b) => b.x - a.x);
      order = new Array(cand.length);
      sorted.forEach((s, k) => (order[s.i] = k));
    } else {
      // Pick the assignment with the lowest cost (position + body signature).
      const cost = (p: PosePerson, slot: number) => {
        const tr = this.tracks[slot];
        if (!tr) return 0.5;
        const age = Math.min(2, t - tr.lastSeen);
        const sg = PeopleAssigner.sig(p);
        const sigCost = sg.reduce((s, v, k) => s + Math.abs(v - tr.sig[k]), 0);
        return Math.abs(cx(p) - tr.cx) / (1 + age * 2) + sigCost * 0.15;
      };
      if (cand.length === 1) {
        order = [cost(cand[0], 0) <= cost(cand[0], 1) ? 0 : 1];
      } else {
        const straight = cost(cand[0], 0) + cost(cand[1], 1);
        const crossed = cost(cand[0], 1) + cost(cand[1], 0);
        order = straight <= crossed ? [0, 1] : [1, 0];
      }
    }
    cand.forEach((p, i) => {
      const slot = order[i];
      out[slot] = p;
      const prev = this.tracks[slot];
      const sg = PeopleAssigner.sig(p);
      this.tracks[slot] = {
        cx: cx(p),
        sig: prev ? prev.sig.map((v, k) => v * 0.97 + sg[k] * 0.03) : sg,
        lastSeen: t,
      };
    });
    return out;
  }

  reset() {
    this.tracks = this.tracks.map(() => null);
  }
}

export class PoseInput {
  tracker = new PoseTracker();
  recognizers: GestureRecognizer[] = [];
  assigner: PeopleAssigner;
  latest: GestureOutput[] = [];
  private pendingActions: GestureOutput['actions'][] = [];
  lastFrame: PoseFrame | null = null;
  lastPeople: (PosePerson | null)[] = [];
  onUpdate: (() => void) | null = null;
  skeleton: CanvasRenderingContext2D | null = null;
  ready = false;
  private t0 = performance.now();

  constructor(public players: number) {
    this.assigner = new PeopleAssigner(players);
    this.setPlayers(players);
  }

  setPlayers(n: number) {
    this.players = n;
    this.assigner = new PeopleAssigner(n);
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
