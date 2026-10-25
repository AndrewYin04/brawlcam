// Keeps each person attached to the same player slot across frames (local 2-player on one camera).
export interface PosePerson {
  image: number[][];
  world: number[][];
}

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
export class PeopleAssigner<P extends PosePerson = PosePerson> {
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

  assign(people: P[], t: number): (P | null)[] {
    const out: (P | null)[] = Array.from({ length: this.slots }, () => null);
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

