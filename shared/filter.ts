// One Euro filter (Casiez et al. 2012): low lag when moving fast, smooth when still.
export class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(public minCutoff = 1.5, public beta = 0.4, public dCutoff = 1.0) {}

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, t: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = Math.max(1e-3, t - this.tPrev);
    this.tPrev = t;
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = this.alpha(cutoff, dt);
    this.xPrev = a * x + (1 - a) * this.xPrev;
    return this.xPrev;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
  }
}

export class VecFilter {
  private f: OneEuro[];
  constructor(n: number, minCutoff = 1.5, beta = 0.4) {
    this.f = Array.from({ length: n }, () => new OneEuro(minCutoff, beta));
  }
  filter(v: number[], t: number): number[] {
    return v.map((x, i) => this.f[i].filter(x, t));
  }
  reset() {
    this.f.forEach((f) => f.reset());
  }
}
