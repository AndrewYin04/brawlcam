// Rule-based gesture recognition from MediaPipe pose landmarks.
// Pure TypeScript so it runs in the browser and in Node (offline tuning against labeled clips).
import { mpWorldToAvatar, J, MP_INDEX, type Joints, type V3 } from './joints';
import { VecFilter } from './filter';
import type { Action, ActionKind, Hand } from './sim';

export type LM = [number, number, number, number];

export interface PersonFrame {
  t: number; // seconds
  world: LM[]; // 33 MediaPipe world landmarks
  image: LM[]; // 33 normalized image landmarks
}

export interface Calibration {
  shoulderW: number; // meters (world)
  armLen: number; // meters (world), shoulder->elbow->wrist
  imgShoulderW: number; // normalized image units
  imgCenterX: number;
}

export const DEFAULT_CALIB: Calibration = { shoulderW: 0.34, armLen: 0.52, imgShoulderW: 0.22, imgCenterX: 0.5 };

export const GESTURE_CFG = {
  window: 0.1, // s, velocity window
  strokeWindow: 0.2, // s, look-back for stroke direction
  // jab / straight
  extRate: 1.5, // arm extension (fraction of arm length) per second
  extMin: 0.6, // extension reached to count
  elbowOpenMin: 105, // deg, elbow angle reached
  jabMinSpeed: 1.2, // m/s wrist speed relative to shoulders
  // hook
  hookVel: 1.7, // m/s lateral wrist velocity toward the midline
  hookElbowMax: 150,
  // uppercut
  upVel: 1.7, // m/s upward wrist velocity
  upStartBelow: 0.12, // wrist must start this far below shoulder line (m)
  // peak detection
  riseWindow: 0.35, // s, a strike must rise within this window
  jabElbowRise: 28, // deg the elbow opens during a jab
  jabExtRise: 0.05, // minimum extension rise (fraction of arm length)
  upElbowMax: 115, // uppercuts keep the elbow bent
  upRise: 0.17, // m wrist rise relative to shoulders
  hookRise: 0.17, // m lateral sweep toward the midline
  strikeMinSpeed: 1.0, // m/s
  // shared
  handRefractory: 0.32, // s between strikes of the same hand
  palmPairWindow: 0.12, // s for both hands to extend together
  palmMaxGap: 1.2, // wrists within this many shoulder widths
  // block: both wrists at/above the shoulder line, close together, elbows below wrists
  blockHold: 0.15,
  blockRelease: 0.18,
  blockMinY: -0.04, // m relative to the shoulder line (guard sits around -0.1)
  blockMaxGap: 0.2, // m between wrists (guard is ~0.27)
  blockMinExt: 0.6, // both arms held out (fraction of arm length) for the extended block
  // X shield: wrists touching above the face with elbows spread (or truly crossed)
  xMaxGap: 0.13,
  xAboveNose: 0.08,
  xElbowSpread: 0.1,
  xElbowMinY: -0.02, // m: X elbows are raised to about shoulder height (block elbows stay below)
  bilateralSpeed: 1.3, // m/s: other hand moving this fast => possible two-handed move
  // X shield
  xHold: 0.18,
  xRelease: 0.2,
  // kicks
  legVis: 0.6,
  kneeUpVel: 1.4,
  kneeHighAboveHip: -0.22, // knee y > hip y + this
  ankleKickVel: 2.6,
  kickRefractory: 0.7,
  kneeLiftY: 0.39, // m below hip: knee above this height counts as lifted (standing knee is ~0.42)
  // movement
  leanDead: 0.035, // m
  leanFull: 0.1,
  stepDead: 0.08, // fraction of calibrated shoulder width in image
  stepFull: 0.2,
  turnOn: 0.6, // rad torso yaw to switch target
  turnOff: 0.25,
  turnHold: 0.25,
  // movement mode: 'lean' (lean to strafe, step to advance) or 'point' (hold an arm out to point where to go)
  moveMode: 'lean' as 'lean' | 'point',
  pointHold: 0.3, // s an arm must stay extended and still
  // presence
  minShoulderVis: 0.5,
};

export interface GestureOutput {
  present: boolean;
  actions: (Action & { t: number })[];
  blocking: boolean;
  xshield: boolean;
  move: [number, number];
  turn: number;
  legs: boolean;
  joints: Joints | null; // smoothed avatar-space joints for rendering
  calibrating?: { progress: number; guidance: string | null; done: boolean };
  debug?: Record<string, number>;
}

interface Hist {
  t: number;
  p: V3[]; // avatar-space joints (lightly filtered)
}

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function len(a: V3) {
  return Math.hypot(a[0], a[1], a[2]);
}
function mid(a: V3, b: V3): V3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}
function angleDeg(a: V3, b: V3) {
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ((len(a) || 1) * (len(b) || 1));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

export class GestureRecognizer {
  cfg = { ...GESTURE_CFG };
  calib: Calibration = { ...DEFAULT_CALIB };
  calibrated = false;
  private hist: Hist[] = [];
  private feat: Record<'L' | 'R', { t: number; ext: number; elbow: number; y: number; u: number; speed: number }[]> = { L: [], R: [] };
  private renderFilter = new VecFilter(15 * 3, 1.2, 0.6);
  private gestFilter = new VecFilter(15 * 3, 6, 0.8);
  private lastStrike: Record<string, number> = { L: -9, R: -9, kickL: -9, kickR: -9 };
  private lastCandidate: Record<string, number> = {};
  private pending: { hand: 'L' | 'R'; a: Action; t: number } | null = null;
  private blockOnAt = -1;
  private blockOffAt = -1;
  private blocking = false;
  private xOnAt = -1;
  private xOffAt = -1;
  private xshield = false;
  private turnSince = -1;
  private turnLatched = 0;
  private lastSeen = -9;
  private calibFrames: { sw: number; arm: number; isw: number; cx: number }[] = [];
  private calibStart = -1;
  private standingAnkleY: [number, number] | null = null;
  private legsBusyUntil = -9;
  private pointSince: Record<string, number | null> = {};
  /** Set to [] to collect per-frame candidate/suppression notes (tuning tools). */
  debugLog: string[] | null = null;

  /** Start (or restart) the 3-second guard calibration. */
  beginCalibration() {
    this.calibrated = false;
    this.calibFrames = [];
    this.calibStart = -1;
  }

  skipCalibration(c?: Partial<Calibration>) {
    this.calib = { ...this.calib, ...c };
    this.calibrated = true;
  }

  reset() {
    this.hist = [];
    this.feat = { L: [], R: [] };
    this.renderFilter.reset();
    this.gestFilter.reset();
    this.pending = null;
    this.blocking = false;
    this.xshield = false;
  }

  update(frame: PersonFrame | null, now: number): GestureOutput {
    const out: GestureOutput = { present: false, actions: [], blocking: false, xshield: false, move: [0, 0], turn: 0, legs: false, joints: null };
    if (!frame || frame.world.length < 33) {
      if (now - this.lastSeen > 0.4) this.reset();
      this.flushPending(now, out, true);
      return out;
    }
    const shVis = Math.min(frame.world[11][3], frame.world[12][3]);
    if (shVis < this.cfg.minShoulderVis) {
      this.flushPending(now, out, true);
      return out;
    }
    this.lastSeen = now;
    out.present = true;
    const t = frame.t;

    // Avatar-space joints
    const raw: number[] = [];
    for (const idx of MP_INDEX) {
      const w = frame.world[idx];
      const v = mpWorldToAvatar(w[0], w[1], w[2]);
      raw.push(v[0], v[1], v[2]);
    }
    const g = this.gestFilter.filter(raw, t);
    const r = this.renderFilter.filter(raw, t);
    const P: V3[] = [];
    const R: V3[] = [];
    for (let i = 0; i < 15; i++) {
      P.push([g[i * 3], g[i * 3 + 1], g[i * 3 + 2]]);
      R.push([r[i * 3], r[i * 3 + 1], r[i * 3 + 2]]);
    }
    const legVis = Math.min(frame.world[25][3], frame.world[26][3], frame.world[27][3], frame.world[28][3]);
    const ankInFrame = frame.image[27][1] < 0.98 && frame.image[28][1] < 0.98;
    out.legs = legVis > this.cfg.legVis && ankInFrame;
    out.joints = { p: R, legs: out.legs };

    this.hist.push({ t, p: P });
    while (this.hist.length && t - this.hist[0].t > 0.6) this.hist.shift();

    const lS = P[J.lSh];
    const rS = P[J.rSh];
    const MS = mid(lS, rS);
    const SW = Math.max(0.15, len(sub(lS, rS)));
    const nose = P[J.nose];
    const imgSW = Math.hypot(frame.image[11][0] - frame.image[12][0], frame.image[11][1] - frame.image[12][1]);
    const imgCX = (frame.image[11][0] + frame.image[12][0]) / 2;

    // ---- calibration ----
    if (!this.calibrated) {
      out.calibrating = this.calibrationStep(P, t, imgSW, imgCX, frame);
      return out;
    }

    // ---- per-hand strikes ----
    const past = this.at(t - this.cfg.window);
    const strokeStart = this.at(t - this.cfg.strokeWindow);
    const handInfo = (['L', 'R'] as const).map((h) => {
      const S = h === 'L' ? lS : rS;
      const E = h === 'L' ? P[J.lEl] : P[J.rEl];
      const W = h === 'L' ? P[J.lWr] : P[J.rWr];
      const elbow = angleDeg(sub(S, E), sub(W, E));
      const ext = len(sub(W, S)) / this.calib.armLen;
      let v: V3 = [0, 0, 0];
      let extRate = 0;
      let speed = 0;
      let stroke: V3 = [0, 0, 0];
      let startY = W[1] - MS[1];
      if (past) {
        const pS = h === 'L' ? past.p[J.lSh] : past.p[J.rSh];
        const pW = h === 'L' ? past.p[J.lWr] : past.p[J.rWr];
        const pMS = mid(past.p[J.lSh], past.p[J.rSh]);
        const dt = Math.max(1e-3, t - past.t);
        const rel = sub(W, MS);
        const prel = sub(pW, pMS);
        v = [(rel[0] - prel[0]) / dt, (rel[1] - prel[1]) / dt, (rel[2] - prel[2]) / dt];
        speed = len(v);
        extRate = (ext - len(sub(pW, pS)) / this.calib.armLen) / dt;
      }
      if (strokeStart) {
        const sW = h === 'L' ? strokeStart.p[J.lWr] : strokeStart.p[J.rWr];
        const sMS = mid(strokeStart.p[J.lSh], strokeStart.p[J.rSh]);
        stroke = sub(sub(W, MS), sub(sW, sMS));
        startY = sW[1] - sMS[1];
      }
      return { h, S, E, W, elbow, ext, v, speed, extRate, stroke, startY };
    });

    // Peak-based strike detection: robust to frame rate (works the same at 10, 15, or 30 fps).
    const candidates: { hand: 'L' | 'R'; kind: ActionKind; score: number; speed: number; t: number }[] = [];
    for (const hi of handInfo) {
      const side = hi.h === 'L' ? 1 : -1; // +X is the person's left
      const F = this.feat[hi.h];
      F.push({ t, ext: hi.ext, elbow: hi.elbow, y: hi.W[1] - MS[1], u: -side * (hi.W[0] - MS[0]), speed: hi.speed });
      while (F.length && t - F[0].t > 0.6) F.shift();
      const n = F.length;
      if (n < 3) continue;
      const k = n - 2;
      const pk = F[k];
      if (pk.t - this.lastStrike[hi.h] < this.cfg.handRefractory) continue;
      if (pk.t - (this.lastCandidate[hi.h] ?? -9) < 0.12) continue;
      const peakOf = (key: 'ext' | 'y' | 'u' | 'elbow') => {
        if (!(pk[key] >= F[k - 1][key] && pk[key] > F[n - 1][key])) return null;
        let minV = pk[key];
        let minT = pk.t;
        for (let i = k - 1; i >= 0 && pk.t - F[i].t <= this.cfg.riseWindow; i--) {
          if (F[i][key] < minV) {
            minV = F[i][key];
            minT = F[i].t;
          }
        }
        const dt = pk.t - minT;
        if (dt <= 0) return null;
        const peakSpeed = Math.max(...F.slice(0, n).filter((f) => f.t >= minT && f.t <= F[n - 1].t).map((f) => f.speed));
        return { rise: pk[key] - minV, dt, start: F.find((f) => f.t === minT)!, peakSpeed };
      };
      // Jab/straight: the elbow opens quickly (robust even when the punch points at the camera).
      const jab = peakOf('elbow');
      if (jab && jab.rise >= this.cfg.jabElbowRise && pk.elbow >= this.cfg.elbowOpenMin && pk.ext - jab.start.ext >= this.cfg.jabExtRise) {
        // The elbow also opens during a hook: if the wrist swept far toward the midline in the same window, it is a hook.
        let uMin = pk.u;
        for (let i = k; i >= 0 && pk.t - F[i].t <= this.cfg.riseWindow; i--) uMin = Math.min(uMin, F[i].u);
        const uNow = Math.max(pk.u, F[n - 1].u);
        const kind: ActionKind = uNow - uMin >= this.cfg.hookRise * 1.2 && pk.elbow < this.cfg.hookElbowMax ? 'hook' : 'jab';
        candidates.push({ hand: hi.h, kind, score: jab.rise / this.cfg.jabElbowRise, speed: Math.max(jab.peakSpeed, ((pk.ext - jab.start.ext) * this.calib.armLen) / jab.dt), t: pk.t });
      }
      const up = peakOf('y');
      if (up && up.rise >= this.cfg.upRise && up.start.y < -this.cfg.upStartBelow && pk.elbow < this.cfg.upElbowMax) {
        candidates.push({ hand: hi.h, kind: 'uppercut', score: (up.rise / this.cfg.upRise) * 1.1, speed: Math.max(up.peakSpeed, up.rise / up.dt), t: pk.t });
      }
      const hook = peakOf('u');
      if (hook && hook.rise >= this.cfg.hookRise && pk.elbow < this.cfg.hookElbowMax && pk.y > -0.3) {
        candidates.push({ hand: hi.h, kind: 'hook', score: hook.rise / this.cfg.hookRise, speed: Math.max(hook.peakSpeed, hook.rise / hook.dt), t: pk.t });
      }
    }
    if (this.debugLog) for (const c of candidates) this.debugLog.push(`${t.toFixed(2)} cand ${c.kind}${c.hand} score ${c.score.toFixed(2)} speed ${c.speed.toFixed(2)} peakT ${c.t.toFixed(2)}`);
    // Ignore slow, gestural movements.
    for (let i = candidates.length - 1; i >= 0; i--) if (candidates[i].speed < this.cfg.strikeMinSpeed) candidates.splice(i, 1);
    // Strongest candidate per hand.
    const byHand = new Map<string, (typeof candidates)[number]>();
    for (const c of candidates) {
      const cur = byHand.get(c.hand);
      if (!cur || c.score > cur.score) byHand.set(c.hand, c);
    }
    const lW = P[J.lWr];
    const rW = P[J.rWr];
    const lE = P[J.lEl];
    const rE = P[J.rEl];
    const wristsGap = len(sub(lW, rW)) / SW;
    const dxW = Math.abs(lW[0] - rW[0]);
    const ry = (v: V3) => v[1] - MS[1];
    const noseY = ry(nose);
    // ---- block and X shield poses (measured on labeled clips, see TESTING.md) ----
    // Pose tracking cannot resolve tightly crossed wrists, so an X reads as "wrists touching, high, elbows spread".
    const imgCrossed = frame.image[15][0] < frame.image[16][0] - 0.01 && frame.image[15][1] < frame.image[23][1] && frame.image[16][1] < frame.image[24][1];
    const worldCrossed = lW[0] < rW[0] - 0.03 && lE[0] > rE[0] + 0.05;
    const elbowsUp = ry(lE) > this.cfg.xElbowMinY && ry(rE) > this.cfg.xElbowMinY;
    // Chest-level X: wrists visibly crossed below the face. (At face height, stacked wrists in a block can look crossed.)
    const chestX = (imgCrossed || worldCrossed) && ry(lW) > -0.3 && ry(rW) > -0.3 && ry(lW) < noseY - 0.05 && ry(rW) < noseY - 0.05;
    const trulyCrossed = chestX || ((imgCrossed || worldCrossed) && elbowsUp);
    // High X: wrists together above the face with the elbows raised and spread.
    const highTight = dxW < this.cfg.xMaxGap && elbowsUp && ry(lW) > noseY + this.cfg.xAboveNose && ry(rW) > noseY + this.cfg.xAboveNose && lE[0] - rE[0] > dxW + this.cfg.xElbowSpread;
    const xPose = trulyCrossed || highTight;
    const [hL, hR] = handInfo;
    // Extended block: both forearms held out in front of the face.
    const blockExtended = dxW < this.cfg.blockMaxGap && ry(lW) > this.cfg.blockMinY && ry(rW) > this.cfg.blockMinY && hL.ext > this.cfg.blockMinExt && hR.ext > this.cfg.blockMinExt;
    // Tight block: both fists pulled up to eye level, elbows down.
    const blockTight = dxW < this.cfg.blockMaxGap + 0.05 && ry(lW) > noseY - 0.02 && ry(rW) > noseY - 0.02 && lE[1] < lW[1] && rE[1] < rW[1];
    const blockPose = !xPose && (blockExtended || blockTight);
    // Two-handed motions that end at face height are defenses forming, not strikes.
    const defensiveEnd = xPose || (blockPose && ry(lW) > noseY - 0.05 && ry(rW) > noseY - 0.05) || blockExtended;

    // ---- strike emission with suppression rules ----
    // Legs busy (kick or knee in progress): arm swings are balance, not strikes.
    let legsBusy = false;
    if (out.legs && past) {
      const dt = Math.max(1e-3, t - past.t);
      const midHipNow = mid(P[J.lHip], P[J.rHip]);
      for (const [kneeI, ankI] of [[J.lKnee, J.lAnk], [J.rKnee, J.rAnk]] as const) {
        const kneeV = (P[kneeI][1] - past.p[kneeI][1]) / dt;
        const ankV = len(sub(P[ankI], past.p[ankI])) / dt;
        // Kick motion only (knee raised or rising fast). Plain steps and foot pivots during hooks don't count.
        void ankV;
        // Kick motion: knee near hip height, or rising fast once already lifted above standing height
        // (bouncing boxers move their knees fast without lifting them).
        if (P[kneeI][1] > midHipNow[1] - 0.3 || (kneeV > 1.2 && P[kneeI][1] > midHipNow[1] - this.cfg.kneeLiftY)) legsBusy = true;
      }
    }
    if (legsBusy) this.legsBusyUntil = t + 0.25;
    const suppressAll = this.blocking || this.xshield || t < this.legsBusyUntil;
    if (this.debugLog && byHand.size) this.debugLog.push(`${t.toFixed(2)} byHand ${[...byHand.values()].map((c) => c.kind + c.hand).join(',')} suppress=${suppressAll} (block ${this.blocking} x ${this.xshield} legs ${t < this.legsBusyUntil}) defensiveEnd=${defensiveEnd} pending=${!!this.pending}`);
    const otherSpeed = (h: 'L' | 'R') => handInfo.find((x) => x.h !== h)!.speed;
    const decideBilateral = (a: (typeof candidates)[number], b: { hand: 'L' | 'R'; a: Action; t: number } | (typeof candidates)[number]) => {
      const bAction: Action = 'a' in b ? b.a : { kind: b.kind, hand: b.hand, speed: b.speed };
      if (defensiveEnd) return; // raising both arms into a block or X
      if (a.kind === 'jab' && bAction.kind === 'jab' && wristsGap < this.cfg.palmMaxGap && ry(lW) < noseY - 0.05 && ry(rW) < noseY - 0.05) {
        out.actions.push({ kind: 'palm', hand: 'B', speed: Math.max(a.speed, bAction.speed), t });
        return;
      }
      // Two different strikes at once: keep the stronger one.
      const keep = a.speed >= bAction.speed ? { kind: a.kind, hand: a.hand as Hand, speed: a.speed } : bAction;
      out.actions.push({ ...keep, t });
    };
    const cands = [...byHand.values()];
    // Any candidate blocks the same hand briefly (one motion, one decision); the full refractory starts only when a strike is emitted.
    for (const c of cands) this.lastCandidate[c.hand] = c.t;
    const nBefore = out.actions.length;
    if (suppressAll) {
      this.pending = null;
    } else if (cands.length === 2) {
      this.pending = null;
      decideBilateral(cands[0], cands[1]);
    } else if (cands.length === 1) {
      const c = cands[0];
      if (this.pending && this.pending.hand !== c.hand && t - this.pending.t <= this.cfg.palmPairWindow) {
        const p = this.pending;
        this.pending = null;
        decideBilateral(c, p);
      } else if (otherSpeed(c.hand) > this.cfg.bilateralSpeed || defensiveEnd) {
        // The other hand is moving too: wait briefly to see if this is a two-handed move.
        this.pending = { hand: c.hand, a: { kind: c.kind, hand: c.hand, speed: c.speed }, t };
      } else {
        out.actions.push({ kind: c.kind, hand: c.hand, speed: c.speed, t: c.t });
      }
    }
    if (this.pending && t - this.pending.t > this.cfg.palmPairWindow) {
      // Window passed with no partner: emit unless the arms ended in a defensive pose.
      if (!defensiveEnd && !this.blocking && !this.xshield) out.actions.push({ ...this.pending.a, t: this.pending.t });
      this.pending = null;
    }
    for (const a of out.actions.slice(nBefore)) {
      if (a.hand === 'L' || a.hand === 'R') this.lastStrike[a.hand] = a.t;
      else if (a.hand === 'B') this.lastStrike.L = this.lastStrike.R = a.t;
    }

    const handsSlow = handInfo.every((h) => h.speed < 2.5);
    [this.blocking, this.blockOnAt, this.blockOffAt] = hysteresis(blockPose && handsSlow, this.blocking, t, this.blockOnAt, this.blockOffAt, this.cfg.blockHold, this.cfg.blockRelease);
    const wasX = this.xshield;
    [this.xshield, this.xOnAt, this.xOffAt] = hysteresis(xPose && handsSlow, this.xshield, t, this.xOnAt, this.xOffAt, this.cfg.xHold, this.cfg.xRelease);
    if (this.xshield && !wasX) out.actions.push({ kind: 'xshield', hand: 'B', speed: 0, t });
    out.blocking = this.blocking;
    out.xshield = this.xshield;

    // ---- kicks ----
    if (out.legs) {
      const lHip = P[J.lHip];
      const rHip = P[J.rHip];
      const midHip = mid(lHip, rHip);
      if (!this.standingAnkleY) this.standingAnkleY = [P[J.lAnk][1], P[J.rAnk][1]];
      else {
        this.standingAnkleY[0] = Math.min(this.standingAnkleY[0] * 0.995 + P[J.lAnk][1] * 0.005, this.standingAnkleY[0] + 0.001);
        this.standingAnkleY[1] = Math.min(this.standingAnkleY[1] * 0.995 + P[J.rAnk][1] * 0.005, this.standingAnkleY[1] + 0.001);
      }
      if (past) {
        const dt = Math.max(1e-3, t - past.t);
        for (const [leg, kneeI, ankI, k] of [
          ['L', J.lKnee, J.lAnk, 0],
          ['R', J.rKnee, J.rAnk, 1],
        ] as const) {
          const key = 'kick' + leg;
          // One kick at a time: the cooldown is shared by both legs.
          if (t - Math.max(this.lastStrike.kickL, this.lastStrike.kickR) < this.cfg.kickRefractory) continue;
          const knee = P[kneeI];
          const ank = P[ankI];
          const kneeV = (knee[1] - past.p[kneeI][1]) / dt;
          const ankV = len(sub(ank, past.p[ankI])) / dt;
          const kneeHigh = knee[1] > midHip[1] + this.cfg.kneeHighAboveHip;
          const ankleUp = ank[1] - this.standingAnkleY[k] > 0.3;
          if ((kneeHigh && kneeV > this.cfg.kneeUpVel) || (ankleUp && ankV > this.cfg.ankleKickVel)) {
            this.lastStrike[key] = t;
            this.legsBusyUntil = t + 0.35; // arm swing right after a kick is balance, not a strike
            out.actions.push({ kind: 'kick', hand: leg as Hand, speed: Math.max(ankV, kneeV), t });
          }
        }
      }
    }

    // ---- movement ----
    const midHip = mid(P[J.lHip], P[J.rHip]);
    const lean = MS[0] - midHip[0]; // + = leaning to the person's left
    const strafe = deadzone(lean, this.cfg.leanDead, this.cfg.leanFull);
    const ratio = imgSW / this.calib.imgShoulderW - 1;
    const fwd = deadzone(ratio, this.cfg.stepDead, this.cfg.stepFull);
    // While striking or blocking, ignore movement noise from the torso.
    const busy = out.actions.length > 0 || this.blocking;
    out.move = busy ? [0, 0] : [strafe, fwd];
    if (this.cfg.moveMode === 'point') {
      // Hand-pointing prototype: one arm held straight and still points where to go (the other arm stays free).
      let pm: [number, number] = [0, 0];
      for (const hi of handInfo) {
        const straight = hi.elbow > 145 && hi.ext > 0.8 && hi.speed < 0.8;
        const key = 'point' + hi.h;
        if (straight) {
          if (this.pointSince[key] == null) this.pointSince[key] = t;
          if (t - this.pointSince[key]! >= this.cfg.pointHold) {
            const d = sub(hi.W, hi.S);
            const lateral = d[0] / (Math.hypot(d[0], d[2]) || 1);
            const forward = d[2] / (Math.hypot(d[0], d[2]) || 1);
            pm = Math.abs(lateral) > Math.abs(forward) ? [Math.sign(lateral), 0] : [0, forward > 0 ? 1 : -1];
          }
        } else this.pointSince[key] = null;
      }
      out.move = this.blocking ? [0, 0] : pm;
    }

    // ---- torso turn (target switching) ----
    const yaw = Math.atan2(-(lS[2] - rS[2]), lS[0] - rS[0]);
    if (this.turnLatched === 0) {
      if (Math.abs(yaw) > this.cfg.turnOn) {
        if (this.turnSince < 0) this.turnSince = t;
        if (t - this.turnSince > this.cfg.turnHold) {
          this.turnLatched = Math.sign(yaw);
          out.turn = this.turnLatched;
        }
      } else this.turnSince = -1;
    } else if (Math.abs(yaw) < this.cfg.turnOff) {
      this.turnLatched = 0;
      this.turnSince = -1;
    }

    out.debug = { yaw, lean, ratio, lExt: handInfo[0].ext, rExt: handInfo[1].ext, lEl: handInfo[0].elbow, rEl: handInfo[1].elbow, lSp: handInfo[0].speed, rSp: handInfo[1].speed };
    return out;
  }

  private flushPending(t: number, out: GestureOutput, force: boolean) {
    if (this.pending && (force || t - this.pending.t > this.cfg.palmPairWindow)) {
      out.actions.push({ ...this.pending.a, t: this.pending.t });
      this.pending = null;
    }
  }

  private at(t: number): Hist | null {
    // Most recent history entry at or before t.
    for (let i = this.hist.length - 1; i >= 0; i--) if (this.hist[i].t <= t) return this.hist[i];
    return this.hist.length > 1 ? this.hist[0] : null;
  }

  private calibrationStep(P: V3[], t: number, imgSW: number, imgCX: number, frame: PersonFrame) {
    let guidance: string | null = null;
    const noseVis = frame.image[0][3] > 0.5 && frame.image[0][1] > 0.02;
    if (imgSW > 0.42) guidance = 'Step back: too close to the camera';
    else if (imgSW < 0.1) guidance = 'Step closer to the camera';
    else if (!noseVis) guidance = 'Keep your head in the frame';
    else if (imgCX < 0.2 || imgCX > 0.8) guidance = 'Move to the center of the frame';
    const lS = P[J.lSh];
    const rS = P[J.rSh];
    const MS = mid(lS, rS);
    const lW = P[J.lWr];
    const rW = P[J.rWr];
    const guard = lW[1] > MS[1] - 0.25 && rW[1] > MS[1] - 0.25 && lW[1] < MS[1] + 0.4 && rW[1] < MS[1] + 0.4;
    if (!guard && !guidance) guidance = 'Raise both fists to your chin';
    if (guidance) {
      // Allow short glitches without restarting.
      if (this.calibStart >= 0 && t - this.calibStart > 0 && this.calibFrames.length) {
        this.calibFrames.pop();
      }
      if (this.calibFrames.length === 0) this.calibStart = -1;
      return { progress: this.calibFrames.length ? Math.min(1, (t - this.calibStart) / 3) : 0, guidance, done: false };
    }
    if (this.calibStart < 0) this.calibStart = t;
    const arm = (len(sub(lS, P[J.lEl])) + len(sub(P[J.lEl], lW)) + len(sub(rS, P[J.rEl])) + len(sub(P[J.rEl], rW))) / 2;
    this.calibFrames.push({ sw: len(sub(lS, rS)), arm, isw: imgSW, cx: imgCX });
    const progress = Math.min(1, (t - this.calibStart) / 3);
    if (progress >= 1 && this.calibFrames.length >= 10) {
      const med = (k: 'sw' | 'arm' | 'isw' | 'cx') => {
        const a = this.calibFrames.map((f) => f[k]).sort((x, y) => x - y);
        return a[Math.floor(a.length / 2)];
      };
      this.calib = { shoulderW: med('sw'), armLen: Math.max(0.4, med('arm')), imgShoulderW: med('isw'), imgCenterX: med('cx') };
      this.calibrated = true;
      return { progress: 1, guidance: null, done: true };
    }
    return { progress, guidance: null, done: false };
  }
}

function deadzone(v: number, dead: number, full: number) {
  const a = Math.abs(v);
  if (a < dead) return 0;
  return Math.sign(v) * Math.min(1, (a - dead) / (full - dead));
}

function hysteresis(cond: boolean, state: boolean, t: number, onAt: number, offAt: number, hold: number, release: number): [boolean, number, number] {
  if (cond) {
    offAt = -1;
    if (onAt < 0) onAt = t;
    if (!state && t - onAt >= hold) state = true;
  } else {
    onAt = -1;
    if (offAt < 0) offAt = t;
    if (state && t - offAt >= release) state = false;
  }
  return [state, onAt, offAt];
}
