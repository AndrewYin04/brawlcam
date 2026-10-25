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
  imgHipX?: number; // hip center x in the image (fraction of width) at the calibrated spot; learned if missing
  leanZ?: number; // meters: shoulders ahead of hips (toward the camera) in the guard stance; learned if missing
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
  hookElbowMax: 150, // small hooks keep the elbow bent; big ones (sweep >= hookSweep) may open it fully
  // Tuned on drill sessions fda75d56 / 2dd3adbd and the shadowboxing clips: the user's big hooks sweep 0.68-1.08 m;
  // straights sweep <= 0.11 m from a square stance, but crosses from a bladed stance sweep 0.29-0.41 m.
  hookSweep: 0.45, // m toward the midline: a big hook, whatever the elbow does
  hookTurnDeg: 35, // deg torso turn within the strike window (shoulder-depth yaw is noisy) ...
  hookSweepWithTurn: 0.3, // ... with at least this sweep also makes a hook
  twoArmRise: 0.25, // m: both wrists rising at least this (and within 2x of each other) is a two-arm move, not a strike
  bigSwingSpeed: 3.0, // m/s: a big swing this fast is a strike even if the arms end near the face
  bigUpRise: 0.4, // m wrist rise: a big uppercut (hooks rise <= 0.43 m, and less than they sweep)
  upOverSweep: 0.75, // a big uppercut rises at least this fraction of its sweep
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
  stepDead: 0.1, // log of apparent size vs your spot (0.1 = 10% larger/smaller in the image)
  stepFull: 0.22,
  diagonalMin: 0.75, // while strafing harder, forward/back only counts when at least this strong (deliberate diagonal)
  spotWindow: 10, // s: your spot is the median size over this many seconds of standing settled
  spotMinSamples: 20, // settled frames needed before the median replaces the calibrated size
  spotSettle: 0.6, // s window to decide you are standing settled
  spotStill: 0.05, // log size range within that window that counts as settled
  // Strafe by stepping sideways: hip center x in the image vs the calibrated spot, in calibrated shoulder widths.
  sideStepDead: 0.3,
  sideStepFull: 0.9,
  edgeMargin: 0.1, // fraction of image width: closer to the edge than this stops increasing the strafe that way
  moveSmooth: 0.15, // s
  moveQuietAfterStrike: 0.35, // s: torso motion around a strike is the punch, not a step
  armBusySpeed: 1.2, // m/s: a hand this fast means a strike is starting (0.9 also caught tracking jitter close to the camera, session ea6e2541)
  moveQuietAfterDetect: 0.65, // s: recovery after a detected strike (lean-back, re-squaring) is not movement
  moveHoldLookback: 0.2, // s: during a strike, movement holds its value from this long before the onset
  fwdPersist: 0.2, // s: forward/back intent must last this long before it moves the fighter
  stepMaxYaw: (35 * Math.PI) / 180, // ignore shoulder width when the torso is twisted more than this
  turnOn: 0.6, // rad torso yaw to switch target
  turnOff: 0.25,
  turnHold: 0.25,
  // movement mode: 'lean' (lean to strafe, step to advance) or 'point' (hold an arm out to point where to go)
  moveMode: 'lean' as 'lean' | 'point',
  pointHold: 0.3, // s an arm must stay extended and still
  // presence
  minShoulderVis: 0.5,
};

/**
 * Grappling gestures (planner spec 2026-10-25 2:50 AM, section B). The detector only reads features and its 'grab' /
 * 'throw' actions are appended after all other detection. The sim ignores both actions unless SimConfig.grapple.
 * Its reach state also feeds two strike rules (jab hold, energy-blast hold; see jabHold* / blastHold* below) that keep a
 * two-arm reach from firing a jab or a blast; those apply with or without SimConfig.grapple.
 */
export const GRAPPLE_CFG = {
  // Reach: both arms extend forward together.
  reachExt: 0.65, // extension both arms must pass (0.75 missed 3 of 4 real reaches toward the camera, foreshortened: session ea6e2541)
  holdReachExt: 0.75, // the jab hold's "arm out at reach length" (tuned with the jab-latency checks; kept when reachExt dropped)
  reachSync: 0.25, // s: the two arms must pass reachExt within this of each other
  reachRise: 0.12, // an arm "reaches" when it passes reachExt having extended by at least this within reachRiseWindow
  armBack: 0.15, // an arm that comes back this far from its reach peak is no longer reaching
  reachUp: 0.25, // m wrist rise within reachRiseWindow that also counts as a reach (camera below the face)
  reachRiseWindow: 0.4, // s (so an arm already held out near reachExt in a long guard is not a reach)
  // Pull: then both wrists come back to the chest, close together.
  pullExt: 0.45, // both extensions below this
  pullGap: 1.0, // wrists closer than this many shoulder widths
  pullSyncReach: 0.12, // s: ... or, after a reach whose arms rose within this of each other (a one-two is ~0.2-0.3 s apart),
  pullReachUp: 0.33, // m both wrists rose (reaching up for the neck; punches go forward), and
  pullToGuard: 0.1, // both arms back to within this of the guard the reach started from,
  pullFromPeak: 0.15, // having come back at least this much from the reach,
  pullGapVsGuard: 1.4, // with the hands within this multiple of the guard's spacing
  reachMaxHold: 0.5, // s: arms held out longer than this before coming back is a push-and-hold (energy blast), not a grab
  pullWindow: 0.5, // s from the arms starting back (first arm dropping below reachExt) to the pulled-in pose
  pullSteadyRatio: 1.6, // image shoulder width may not change more than this from reach to pull
  chestReachExt: 0.75, // the chest pull's reach must pass this (unless grab-like)
  pullKeepMargin: 0.08, // looser margin while the pulled-in pose is being held
  pullHold: 0.06, // s the pulled-in pose must persist (single-frame tracking glitches are not grabs)
  pullMaxTurnDeg: 35, // a grab is not a turn: torso yaw stays within this of the reach (also rejects tracking flips)
  grabRefractory: 0.8, // s between grabs
  // Shoulder throw: after the reach, twist the torso and hinge forward.
  throwWindow: 0.8, // s after the reach
  throwTwistDeg: 60, // torso yaw change from the reach
  throwDrop: 0.15, // shoulders drop (toward the hips) by this fraction of the torso length
  throwSquareDeg: 40, // the reach starts squared up to the opponent (|yaw| within this): untwisting is not a throw
  throwHold: 0.06, // s the twisted-and-hinged pose must persist
  throwRefractory: 1.2, // s between throws
  // Keeping a grab's reach from reading as a jab or an energy blast (planner direction 2026-10-25, item 2). These two
  // rules apply whether or not SimConfig.grapple is on: they change only what the recognizer emits for two-arm motions.
  // Jab hold: a jab is one arm. If, when a jab would fire, the jab arm is out at reach length and the OTHER arm is past
  // jabHoldProgress of the way to qualifying as a reaching arm and still extending, the jab is held for up to reachSync.
  // It fires as soon as the second arm stops short, the jab arm comes back, or the window ends; it is dropped if the two
  // arms form a reach. Single-arm jabs (other arm not extending) are not held, so their latency is unchanged.
  jabHoldProgress: 0.5, // fraction of the way from the arm's recent low to max(reachExt, low + reachRise)
  jabHoldRate: 1.5, // extension per second the other arm must exceed to be "still rising" (GESTURE_CFG.extRate). A rate
  // of 0 also held real single jabs whose rear hand drifts forward (shadow_fighterD, ufc_03/05/07: +33-133 ms); at 1.5 no
  // retained jab on any clip is delayed. The synchronous reach (second arm already at full extension) is reachElbowMin's job.
  // The other arm's elbow must be open at least this much (GESTURE_CFG.elbowOpenMin, what a jab needs) for it to count
  // as extending; held palms also keep both elbows at least this open. Measured: on jab_01 the rear hand drifts forward during the jab
  // (extension 0.68 -> 0.80, enough to pass the reach extension test) with its elbow bent at ~100 deg.
  holdElbowMin: 105,
  // Both arms out together in a fresh reach (GrappleDetector reach, both elbows at least this straight) when a jab would
  // fire: the jab is part of a two-arm move and fires nothing (it may still become a held energy blast). 140 dropped
  // real one-twos on shadow_fighterF (elbows 142/145); the synthetic reach is ~180/180.
  reachElbowMin: 150,
  // Energy blast hold: the palms must stay out (both extensions >= blastHoldExt, elbows >= holdElbowMin, wrists forward
  // by blastHoldFwd) for blastHold before the blast fires; a pending blast is cancelled by the pull-in pose
  // (pullExt / pullGap) or as soon as the palms are not held out.
  blastHold: 0.3, // s
  blastHoldExt: 0.75, // a held palm push measures ~0.85-0.9 on palmpush_02; the guard sits ~0.65-0.75
  blastHoldFwd: 0.7, // wrists in front of their shoulders by this fraction of arm length (held push ~0.8, guard ~0.6)
  // ---- Grapple-only strike rules (GestureRecognizer.grappleEnabled; REVIEW.md 6:35 / 6:40 AM). With grappling off none
  // of these run, so the default recognizer's output is unchanged. Tuned on drill session ea6e2541 (grab reps 1, 3, 4, 8);
  // 2dd3adbd held out.
  // A strike whose arm and the other arm rose into a reach within this of each other (GrappleDetector reach sync) while
  // both arms are still out is one arm of a two-arm reach (a grab's reach, or its hold after the pull), not a strike.
  // A one-two's punches rise 0.2-0.3 s apart (pullSyncReach), so they are not affected.
  gSyncReach: 0.12,
  // ... and the other arm's elbow is at least this open (a jab's rear hand drifting forward stays bent, ~100 deg on
  // jab_01; holdElbowMin).
  gSyncElbowMin: 105,
  // ... and the torso turned less than this within the strike window (GESTURE_CFG.hookTurnDeg; a grab is square).
  gSyncMaxTurnDeg: 35, // (50 dropped a real big hook, ea6e2541 hook_L_big rep 14)
  // s after a grab: the follow-through (arms going back out to hold the opponent, re-squaring) is not a strike. The sim
  // ignores strikes during the 0.3 s grab startup and smothers jabs in the clinch anyway.
  gPostGrab: 0.6,
};

export interface GrappleFeatures {
  t: number;
  extL: number; // wrist distance from shoulder / arm length
  extR: number;
  gap: number; // wrist-to-wrist distance, meters
  sw: number; // shoulder width, meters
  yaw: number; // torso yaw, radians
  shH: number; // shoulder-centre height above the hip centre, meters
  torso: number; // shoulder-centre to hip-centre distance, meters
  isw?: number; // shoulder width in the image (tracking-stability check)
  yL?: number; // wrist height relative to the shoulder line, meters (up = +)
  yR?: number;
}

export class GrappleDetector {
  cfg = { ...GRAPPLE_CFG };
  private riseAt = { L: -9, R: -9 };
  private wasExt = { L: false, R: false };
  private wasReach = { L: false, R: false };
  private armPeak = { L: 0, R: 0 };
  private hist: { t: number; L: number; R: number; gap: number; yL: number; yR: number }[] = [];
  /** Time both arms were last out together (the later arm's rise), with the torso pose at that moment. */
  private reach: { t: number; yaw: number; shH: number; torso: number; pulled: boolean; thrown: boolean; pullSince: number; throwSince: number; releasedAt: number; loL: number; loR: number; guardGap: number; sync: number; peakL: number; peakR: number; yLoL: number; yLoR: number; upL: number; upR: number; out: boolean; iswMin: number; iswMax: number } | null = null;
  private lastGrab = -9;
  private lastThrow = -9;
  /** Features of the last grab (tuning tools). */
  lastGrabInfo: Record<string, number | boolean> | null = null;

  reset() {
    this.riseAt = { L: -9, R: -9 };
    this.wasExt = { L: false, R: false };
    this.wasReach = { L: false, R: false };
    this.hist = [];
    this.reach = null;
  }

  /**
   * Arm h (current extension ext, extension rate per second) is past jabHoldProgress of the way to qualifying as a
   * reaching arm and still extending. Reads the history of the latest update() (call update() for this frame first).
   */
  armRising(h: 'L' | 'R', ext: number, rate: number): boolean {
    const c = this.cfg;
    if (!(rate > c.jabHoldRate)) return false;
    let lo = ext;
    for (const x of this.hist) lo = Math.min(lo, x[h]);
    const target = Math.max(c.holdReachExt, lo + c.reachRise);
    return (ext - lo) / Math.max(1e-3, target - lo) >= c.jabHoldProgress;
  }

  /** A grab-like reach (both arms out together, both wrists up) is in progress: not yet pulled, within its window. */
  grabLikeActive(t: number): boolean {
    const r = this.reach;
    const c = this.cfg;
    if (!r || r.pulled || r.thrown) return false;
    if (t - r.t > c.reachMaxHold + c.pullWindow) return false;
    return r.sync <= c.pullSyncReach && Math.min(r.upL, r.upR) >= c.pullReachUp;
  }

  /** The two arms formed a reach at or after time t0 and are both still out. */
  reachSince(t0: number): boolean {
    return !!this.reach && this.reach.t >= t0 && this.reach.out;
  }

  /** Like reachSince, and the two arms rose within maxSync of each other (grapple-only strike rule). */
  syncReachSince(t0: number, maxSync: number): boolean {
    return this.reachSince(t0) && this.reach!.sync <= maxSync;
  }

  /** Time of the last grab this detector emitted (-9 before any). */
  get lastGrabAt(): number {
    return this.lastGrab;
  }

  /** Extension arm h must pass to count as reaching (given its recent low). */
  reachTarget(h: 'L' | 'R', ext: number): number {
    let lo = ext;
    for (const x of this.hist) lo = Math.min(lo, x[h]);
    return Math.max(this.cfg.holdReachExt, lo + this.cfg.reachRise);
  }

  update(f: GrappleFeatures): ('grab' | 'throw')[] {
    const c = this.cfg;
    const out: ('grab' | 'throw')[] = [];
    this.hist.push({ t: f.t, L: f.extL, R: f.extR, gap: f.gap / Math.max(0.15, f.sw), yL: f.yL ?? 0, yR: f.yR ?? 0 });
    while (this.hist.length && f.t - this.hist[0].t > c.reachRiseWindow) this.hist.shift();
    for (const h of ['L', 'R'] as const) {
      const e = h === 'L' ? f.extL : f.extR;
      const ext = e >= c.reachExt;
      // A reach is a motion: the arm passes reachExt after extending by reachRise within the window.
      let lo = e;
      for (const x of this.hist) lo = Math.min(lo, x[h]);
      // Reaching toward a camera that looks up (a laptop below the face) barely changes the measured extension (depth is
      // weak) but lifts the wrist in camera space: a wrist rise of reachUp also counts (drill session 2dd3adbd, grab 6).
      let yLo = h === 'L' ? f.yL ?? 0 : f.yR ?? 0;
      for (const x of this.hist) yLo = Math.min(yLo, h === 'L' ? x.yL : x.yR);
      const yUp = (h === 'L' ? f.yL ?? 0 : f.yR ?? 0) - yLo;
      const reaching = ext && (e - lo >= c.reachRise || yUp >= c.reachUp);
      // A fresh rise counts even if the arm never dropped below reachExt: a low guard can sit right at reachExt (drill
      // session 2dd3adbd, ext 0.78-0.81), which left that arm "reached" from an old rise and never in sync with the other.
      if (reaching && (!this.wasReach[h] || f.t - this.riseAt[h] > c.reachRiseWindow)) (this.riseAt[h] = f.t), (this.armPeak[h] = e);
      else if (this.wasReach[h]) this.armPeak[h] = Math.max(this.armPeak[h], e);
      // Stays "reached" while the arm stays out near its peak: coming back armBack from the peak ends it (a resting guard
      // can sit above reachExt, session ea6e2541, so "below reachExt" alone never released).
      this.wasReach[h] = reaching || (this.wasReach[h] && ext && e >= this.armPeak[h] - c.armBack);
      this.wasExt[h] = ext;
    }
    // Both arms out now, having risen within reachSync of each other: a (new) reach.
    if (this.wasReach.L && this.wasReach.R && Math.abs(this.riseAt.L - this.riseAt.R) <= c.reachSync) {
      const at = Math.max(this.riseAt.L, this.riseAt.R);
      // A re-rise within the same motion (extension flickering around reachExt) does not replace a live reach.
      const live = this.reach && !this.reach.pulled && !this.reach.thrown && f.t - this.reach.t <= c.reachMaxHold;
      if (!this.reach || (this.reach.t !== at && !live)) {
        // The guard the reach started from (the arms' recent lows): the pull is a return to it.
        // Guard level = the median extension before the reach (the minimum caught a brief wind-up dip, session ea6e2541).
        const medOf = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
        let loL = medOf(this.hist.map((x) => x.L)), loR = medOf(this.hist.map((x) => x.R)), guardGap = f.gap / Math.max(0.15, f.sw), lo = Infinity, yLoL = f.yL ?? 0, yLoR = f.yR ?? 0;
        for (const x of this.hist) {
          yLoL = Math.min(yLoL, x.yL);
          yLoR = Math.min(yLoR, x.yR);
          if (x.L + x.R < lo) (lo = x.L + x.R), (guardGap = x.gap);
        }
        this.reach = { t: at, yaw: f.yaw, shH: f.shH, torso: f.torso, pulled: false, thrown: false, pullSince: -1, throwSince: -1, releasedAt: -1, loL, loR, guardGap, sync: Math.abs(this.riseAt.L - this.riseAt.R), peakL: f.extL, peakR: f.extR, yLoL, yLoR, upL: (f.yL ?? 0) - yLoL, upR: (f.yR ?? 0) - yLoR, out: true, iswMin: f.isw ?? 1, iswMax: f.isw ?? 1 };
      }
    }
    const r = this.reach;
    if (!r) return out;
    if (f.isw != null) (r.iswMin = Math.min(r.iswMin, f.isw)), (r.iswMax = Math.max(r.iswMax, f.isw));
    if (r.releasedAt < 0) {
      r.peakL = Math.max(r.peakL, f.extL);
      r.peakR = Math.max(r.peakR, f.extR);
      r.upL = Math.max(r.upL, (f.yL ?? 0) - r.yLoL);
      r.upR = Math.max(r.upR, (f.yR ?? 0) - r.yLoR);
    }
    const age = f.t - r.t;
    // Released (for the pull): an arm left the reach, i.e. dropped below reachExt or came back armBack from its peak.
    if (r.releasedAt < 0 && !(this.wasReach.L && this.wasReach.R)) r.releasedAt = f.t;
    // Still out (for the jab hold): both arms past reachExt.
    r.out = this.wasExt.L && this.wasExt.R;
    const grabLive = r.releasedAt >= 0 ? r.releasedAt - r.t <= c.reachMaxHold && f.t - r.releasedAt <= c.pullWindow : age <= c.reachMaxHold;
    if (!grabLive && age > c.throwWindow) {
      this.reach = null;
      return out;
    }
    const deg = 180 / Math.PI;
    const turn = Math.abs(wrapRad(f.yaw - r.yaw)) * deg;
    if (!r.thrown && age <= c.throwWindow && f.t - this.lastThrow >= c.throwRefractory && Math.abs(r.yaw) * deg <= c.throwSquareDeg) {
      const drop = (r.shH - f.shH) / Math.max(0.2, r.torso);
      if (turn >= c.throwTwistDeg && drop >= c.throwDrop) {
        if (r.throwSince < 0) r.throwSince = f.t;
        if (f.t - r.throwSince >= c.throwHold) {
          r.thrown = true;
          this.lastThrow = f.t;
          out.push('throw');
        }
      } else r.throwSince = -1;
    }
    if (!r.pulled && !r.thrown && grabLive && r.releasedAt >= 0 && f.t - this.lastGrab >= c.grabRefractory) {
      // Pulled in: both arms back to the chest; or, after a reach where both arms went out together (risen within
      // pullSyncReach of each other, unlike a one-two), both arms brought well back from it to the guard it started
      // from. A low guard sits at ext ~0.75, hands ~1.3 shoulder widths apart; that player reaches overhead and pulls
      // down to it (drill session 2dd3adbd), never reaching pullExt.
      // Once the pulled-in pose is seen, a looser margin keeps it (at 13-16 fps the 0.06 s hold is two frames, and the
      // second frame missed by 0.001 in session ea6e2541 grab 1).
      const m = r.pullSince >= 0 ? c.pullKeepMargin : 0;
      // A grab-like reach: both arms went out together (risen within pullSyncReach) and both wrists rose (toward the neck).
      const grabLike = r.sync <= c.pullSyncReach && Math.min(r.upL, r.upR) >= c.pullReachUp;
      // The chest pull needs a full reach (chestReachExt) unless the reach was grab-like (reachExt alone is lowered for
      // foreshortened reaches toward the camera; ufc_08's one-arm 0.74 punch then read as a grab).
      const chest = (grabLike || Math.min(r.peakL, r.peakR) >= c.chestReachExt) && f.extL < c.pullExt + m && f.extR < c.pullExt + m && f.gap < (c.pullGap + m) * f.sw;
      // Back from the reach: extension came back, or (camera below the face) the wrist came back down.
      const toGuard = (e: number, lo: number, pk: number, up: number, y: number, yLo: number) => e <= lo + c.pullToGuard + m && (pk - e >= c.pullFromPeak - m || yLo + up - y >= c.reachUp - m);
      const guardPull = grabLike && toGuard(f.extL, r.loL, r.peakL, r.upL, f.yL ?? 0, r.yLoL) && toGuard(f.extR, r.loR, r.peakR, r.upR, f.yR ?? 0, r.yLoR) && f.gap < Math.max(c.pullGap, r.guardGap * c.pullGapVsGuard) * f.sw;
      // Tracking stayed on one steady person (a referee crossing in ufc_07 swapped the tracked body mid-"reach").
      const steady = r.iswMax / Math.max(1e-3, r.iswMin) <= c.pullSteadyRatio;
      if ((chest || guardPull) && steady && turn <= c.pullMaxTurnDeg) {
        if (r.pullSince < 0) r.pullSince = f.t;
        if (f.t - r.pullSince >= c.pullHold) {
          r.pulled = true;
          this.lastGrab = f.t;
          out.push('grab');
          this.lastGrabInfo = { t: f.t, chest, sync: r.sync, upL: r.upL, upR: r.upR, riseL: r.peakL - r.loL, riseR: r.peakR - r.loR, peakL: r.peakL, peakR: r.peakR, loL: r.loL, loR: r.loR, gap: f.gap / Math.max(0.15, f.sw), guardGap: r.guardGap, reachToPull: f.t - r.t };
        }
      } else r.pullSince = -1;
    }
    return out;
  }
}

function wrapRad(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

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
  /** Player's hip center is near the frame edge: 'left' / 'right' is the side of the player's own body. */
  edge?: 'left' | 'right' | null;
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
  private feat: Record<'L' | 'R', { t: number; ext: number; elbow: number; y: number; u: number; speed: number; yaw: number }[]> = { L: [], R: [] };
  private renderFilter = new VecFilter(15 * 3, 1.2, 0.6);
  private gestFilter = new VecFilter(15 * 3, 6, 0.8);
  private lastStrike: Record<string, number> = { L: -9, R: -9, kickL: -9, kickR: -9 };
  private lastCandidate: Record<string, number> = {};
  private lastStrikeKind: Record<string, string> = {};
  private pending: { hand: 'L' | 'R'; a: Action; t: number } | null = null;
  /** A jab held while the other arm may be joining it in a two-arm reach (GRAPPLE_CFG.jabHold*). t = when held. */
  private jabHold: { hand: 'L' | 'R'; a: Action & { t: number }; t: number } | null = null;
  /** A two-palm push waiting to be held out for GRAPPLE_CFG.blastHold before it fires the energy blast. */
  private blastPending: { a: Action & { t: number }; since: number } | null = null;
  private blockOnAt = -1;
  private blockOffAt = -1;
  private blocking = false;
  private xOnAt = -1;
  private xOffAt = -1;
  /** Any crossed-arms pose (high or chest level): used only to suppress strikes, as before. */
  private xshield = false;
  /** The X-cross super pose (HIGH X only): this is what the game sees as `xshield`. */
  private xHigh = false;
  private xhOnAt = -1;
  private xhOffAt = -1;
  private turnSince = -1;
  private turnLatched = 0;
  private lastSeen = -9;
  private calibFrames: { t: number; sw: number; arm: number; isw: number; cx: number; lz: number; hx: number }[] = [];
  private calibStart = -1;
  private standingAnkleY: [number, number] | null = null;
  private legsBusyUntil = -9;
  private pointSince: Record<string, number | null> = {};
  private leanZSamples: number[] = [];
  private hipXSamples: number[] = [];
  private hipXS = -1;
  private moveQuietUntil = -9;
  private heldMove: [number, number] = [0, 0];
  private moveHist: { t: number; m: [number, number] }[] = [];
  private fwdSign = 0;
  private fwdSince = 0;
  private lastMoveT = -1;
  private sizeS = 0;
  private sizeBase: number | null = null;
  private sizeHist: { t: number; v: number }[] = [];
  private spotSamples: { t: number; v: number }[] = [];
  /** Set to [] to collect per-frame candidate/suppression notes (tuning tools). */
  debugLog: string[] | null = null;
  /** Grab / shoulder-throw detection (additive: runs last and only appends actions). */
  grapple = new GrappleDetector();
  /**
   * Grappling is on for this player (the app sets it with SimConfig.grapple, ?grapple=1). It enables the grapple-only
   * strike rules (GRAPPLE_CFG.g*) that keep a grab's two-arm reach and follow-through from firing strikes. Off (default):
   * none of those rules run and the output is exactly what it was without them.
   */
  grappleEnabled = false;

  /** Start (or restart) the 3-second guard calibration. */
  beginCalibration() {
    this.calibrated = false;
    this.calibFrames = [];
    this.calibStart = -1;
  }

  skipCalibration(c?: Partial<Calibration>) {
    this.calib = { ...this.calib, ...c };
    if (c?.leanZ == null) this.calib.leanZ = undefined;
    if (c?.imgHipX == null) this.calib.imgHipX = undefined;
    this.leanZSamples = [];
    this.hipXSamples = [];
    this.sizeBase = null;
    this.sizeHist = [];
    this.spotSamples = [];
    this.calibrated = true;
  }

  reset() {
    this.hipXS = -1;
    this.hist = [];
    this.feat = { L: [], R: [] };
    this.renderFilter.reset();
    this.gestFilter.reset();
    this.pending = null;
    this.jabHold = null;
    this.blastPending = null;
    this.blocking = false;
    this.xshield = false;
    this.xHigh = false;
    this.grapple.reset();
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
    const candidates: { hand: 'L' | 'R'; kind: ActionKind; score: number; speed: number; t: number; big?: boolean }[] = [];
    const torsoYaw = Math.atan2(-(lS[2] - rS[2]), lS[0] - rS[0]);
    for (const hi of handInfo) {
      const side = hi.h === 'L' ? 1 : -1; // +X is the person's left
      const F = this.feat[hi.h];
      F.push({ t, ext: hi.ext, elbow: hi.elbow, y: hi.W[1] - MS[1], u: -side * (hi.W[0] - MS[0]), speed: hi.speed, yaw: torsoYaw });
      while (F.length && t - F[0].t > 0.6) F.shift();
      const n = F.length;
      if (n < 3) continue;
      const k = n - 2;
      const pk = F[k];
      // Inside the refractory only a big swing may follow a jab: a big hook's wind-up (arm drawn out) can read as a jab
      // 0.3 s before the swing (drill session 2dd3adbd, exact timing); the swing must still fire.
      const inRefractory = pk.t - this.lastStrike[hi.h] < this.cfg.handRefractory;
      if (inRefractory && this.lastStrikeKind[hi.h] !== 'jab') continue;
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
        // (Big swings are reclassified below from the whole motion: sweep, rise and torso turn.)
        candidates.push({ hand: hi.h, kind, score: jab.rise / this.cfg.jabElbowRise, speed: Math.max(jab.peakSpeed, ((pk.ext - jab.start.ext) * this.calib.armLen) / jab.dt), t: pk.t });
      }
      const up = peakOf('y');
      // Big swinging uppercuts open the elbow past 150 deg (drill session 2dd3adbd): the bent-elbow limit only applies to
      // small ones.
      if (up && up.rise >= this.cfg.upRise && up.start.y < -this.cfg.upStartBelow && (pk.elbow < this.cfg.upElbowMax || up.rise >= this.cfg.bigUpRise)) {
        candidates.push({ hand: hi.h, kind: 'uppercut', score: (up.rise / this.cfg.upRise) * 1.1, speed: Math.max(up.peakSpeed, up.rise / up.dt), t: pk.t });
      }
      const hook = peakOf('u');
      // Big hooks open the elbow to 155-160 deg (drill session 2dd3adbd): past hookElbowMax only a big sweep counts.
      if (hook && hook.rise >= this.cfg.hookRise && (pk.elbow < this.cfg.hookElbowMax || hook.rise >= this.cfg.hookSweep) && pk.y > -0.3) {
        candidates.push({ hand: hi.h, kind: 'hook', score: hook.rise / this.cfg.hookRise, speed: Math.max(hook.peakSpeed, hook.rise / hook.dt), t: pk.t });
      }
      // Arbiter for big swings, whichever peak fired (REVIEW.md 4:35 AM): classify by the whole motion, not elbow angle.
      // Big hooks sweep ~1 m toward the midline with a 70-120 deg torso turn; straights sweep <= 0.11 m and turn <= 10 deg;
      // big uppercuts raise the wrist 0.5-0.85 m. Small strikes keep the kind their peak gave them.
      if (candidates.some((c) => c.hand === hi.h)) {
        let uMin = Infinity, yMin = Infinity, yawMin = Infinity, yawMax = -Infinity, yaw0: number | null = null;
        const tEnd = F[n - 1].t;
        for (const f of F) {
          if (tEnd - f.t > this.cfg.riseWindow + 0.05) continue;
          uMin = Math.min(uMin, f.u);
          yMin = Math.min(yMin, f.y);
          // Turn relative to the window's first frame, wrapped (yaw crossing +-180 deg is a small turn, not 358 deg).
          if (yaw0 == null) yaw0 = f.yaw;
          const dy = wrapRad(f.yaw - yaw0);
          yawMin = Math.min(yawMin, dy);
          yawMax = Math.max(yawMax, dy);
        }
        let uMax = -Infinity, yMax = -Infinity, seenUMin = false, seenYMin = false;
        for (const f of F) {
          if (tEnd - f.t > this.cfg.riseWindow + 0.05) continue;
          if (f.u === uMin) seenUMin = true;
          if (f.y === yMin) seenYMin = true;
          if (seenUMin) uMax = Math.max(uMax, f.u);
          if (seenYMin) yMax = Math.max(yMax, f.y);
        }
        const sweep = uMax - uMin, rise = yMax - yMin, turn = ((yawMax - yawMin) * 180) / Math.PI;
        let kind: ActionKind | null = null;
        if (rise >= this.cfg.bigUpRise && rise >= this.cfg.upOverSweep * sweep) kind = 'uppercut';
        else if (sweep >= this.cfg.hookSweep || (turn >= this.cfg.hookTurnDeg && sweep >= this.cfg.hookSweepWithTurn)) kind = 'hook';
        if (kind) for (const c of candidates) if (c.hand === hi.h && (c.kind === 'jab' || c.kind === 'hook' || c.kind === 'uppercut')) {
          if (this.debugLog && c.kind !== kind) this.debugLog.push(`${t.toFixed(2)} reclass ${c.kind}${c.hand} -> ${kind} (sweep ${sweep.toFixed(2)} rise ${rise.toFixed(2)} turn ${turn.toFixed(0)})`);
          c.kind = kind;
          c.big = true;
        }
      }
      if (inRefractory) for (let i = candidates.length - 1; i >= 0; i--) if (candidates[i].hand === hi.h && !(candidates[i].big && candidates[i].speed >= this.cfg.bigSwingSpeed)) candidates.splice(i, 1);
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
    // The X-cross super (Iron Wall) accepts ONE pose: the HIGH X, forearms crossed above the face with the elbows raised
    // (both labeled X clips are this pose; the chest-level branch fires on many frames of ordinary shadow-boxing).
    // A chest-level cross still suppresses strikes and blocks exactly as before, it just does not trigger the super.
    const xHighPose = ((imgCrossed || worldCrossed) && elbowsUp) || highTight;
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
    const info = (h: 'L' | 'R') => (h === 'L' ? handInfo[0] : handInfo[1]);
    const gc = this.grapple.cfg;
    // Grapple features are read here so the jab / blast rules below see this frame's reach state. The detector only reads
    // features, so running it before strike emission does not change its output; its actions are appended at the end.
    const midHipG = mid(P[J.lHip], P[J.rHip]);
    const yawG = Math.atan2(-(lS[2] - rS[2]), lS[0] - rS[0]);
    const grappleActs = this.grapple.update({ t, extL: hL.ext, extR: hR.ext, gap: len(sub(lW, rW)), sw: SW, yaw: yawG, shH: MS[1] - midHipG[1], torso: len(sub(MS, midHipG)), yL: lW[1] - MS[1], yR: rW[1] - MS[1], isw: imgSW });
    const nBefore = out.actions.length;
    let grappleDropped = false; // a strike was dropped by a grapple-only rule this frame (movement treats it as detected)
    const held: (Action & { t: number })[] = []; // strikes taken out of the stream this frame (they keep the hand refractory)
    const palmShape = () => wristsGap < this.cfg.palmMaxGap && ry(lW) < noseY - 0.05 && ry(rW) < noseY - 0.05;
    // Both arms are out together, straight, in a reach that formed at or after t0: a two-arm move, not a jab.
    const bothOut = (t0: number) => this.grapple.reachSince(t0) && Math.min(hL.elbow, hR.elbow) >= gc.reachElbowMin;
    // A jab turned out to be one arm of a two-arm reach: fire nothing for it. If the arms are in the palm-push shape, it
    // may still become the energy blast, which must then be held out for blastHold (and is cancelled by a pull-in).
    const twoArm = (a: Action & { t: number }, why: string) => {
      if (this.debugLog) this.debugLog.push(`${t.toFixed(2)} jab${a.hand} dropped: ${why} (elbows ${hL.elbow.toFixed(0)}/${hR.elbow.toFixed(0)})`);
      this.lastStrike.L = this.lastStrike.R = t;
      if (!defensiveEnd && palmShape() && !this.blastPending) this.blastPending = { a: { kind: 'palm', hand: 'B', speed: a.speed, t }, since: t };
    };
    // Grapple-only rules (grappleEnabled): a single-hand strike that is really part of a grab. Returns why, or null.
    const grappleDrop = (a: Action & { t: number }): string | null => {
      if (!this.grappleEnabled || !(a.kind === 'jab' || a.kind === 'uppercut' || a.kind === 'hook') || (a.hand !== 'L' && a.hand !== 'R')) return null;
      // The grab's follow-through: both arms go back out to hold the opponent (drill session ea6e2541 grab 4, 2dd3adbd
      // grabs 6 and 7 fired a jab 0.2-0.3 s after the grab).
      if (t - this.grapple.lastGrabAt < gc.gPostGrab) return 'grab follow-through';
      // Both arms rose into a reach together and are still out: one arm of a two-arm reach (ea6e2541 grab 1: hook R;
      // grab 3: jab L, jab R).
      // A grab is square to the opponent; a big hook turns the torso 70-120 deg and swings the other arm out with it
      // (2dd3adbd hook reps read as a synchronous reach), so a turning strike is never taken for a reach.
      const o = a.hand === 'L' ? 'R' : 'L';
      if (this.grapple.syncReachSince(t - gc.reachSync, gc.gSyncReach) && info(o).elbow >= gc.gSyncElbowMin) {
        const turn = this.strikeTurnDeg(a.hand);
        if (turn < gc.gSyncMaxTurnDeg) return 'two-arm reach';
        if (this.debugLog) this.debugLog.push(`${t.toFixed(2)} ${a.kind}${a.hand} kept (grapple): two-arm reach but torso turned ${turn.toFixed(0)} deg`);
      }
      return null;
    };
    // A single-hand strike is about to fire. A jab is one arm: if its arm is out at reach length while the other arm is
    // past jabHoldProgress of a reach and still extending, hold it (resolved below); if both arms are already out
    // together in a fresh reach, it is part of that reach.
    const emitSingle = (a: Action & { t: number }) => {
      // Both wrists rising together (a two-arm reach up to the head, drill session 2dd3adbd grab reps) is not one strike.
      if ((a.kind === 'jab' || a.kind === 'uppercut' || a.kind === 'hook') && this.bothRising()) return twoArm(a, 'both arms rising together');
      // A grab's pull-in sweeps both wrists toward the midline, which reads as a hook (session ea6e2541 grab 1).
      if ((a.kind === 'jab' || a.kind === 'uppercut' || a.kind === 'hook') && this.grapple.grabLikeActive(t)) return twoArm(a, 'grab in progress');
      const gWhy = grappleDrop(a);
      if (gWhy) {
        // Like twoArm, but never starts an energy blast (the hands are on the opponent, not pushing).
        if (this.debugLog) this.debugLog.push(`${t.toFixed(2)} ${a.kind}${a.hand} dropped (grapple): ${gWhy}`);
        this.lastStrike.L = this.lastStrike.R = t;
        this.lastStrikeKind[a.hand] = a.kind;
        grappleDropped = true;
        return;
      }
      if (a.kind === 'jab' && (a.hand === 'L' || a.hand === 'R')) {
        const o = a.hand === 'L' ? 'R' : 'L';
        if (bothOut(t - gc.reachSync)) return twoArm(a, 'both arms out in a reach');
        if (info(a.hand).ext >= gc.holdReachExt && info(o).elbow >= gc.holdElbowMin && this.grapple.armRising(o, info(o).ext, info(o).extRate)) {
          if (this.debugLog) this.debugLog.push(`${t.toFixed(2)} jab${a.hand} held: other arm rising (ext ${info(o).ext.toFixed(2)} rate ${info(o).extRate.toFixed(2)})`);
          this.jabHold = { hand: a.hand, a, t };
          held.push(a);
          return;
        }
      }
      out.actions.push(a);
    };
    const decideBilateral = (a: (typeof candidates)[number], b: { hand: 'L' | 'R'; a: Action; t: number } | (typeof candidates)[number]) => {
      const bAction: Action = 'a' in b ? b.a : { kind: b.kind, hand: b.hand, speed: b.speed };
      if (defensiveEnd) return; // raising both arms into a block or X
      if (a.kind === 'jab' && bAction.kind === 'jab' && wristsGap < this.cfg.palmMaxGap && ry(lW) < noseY - 0.05 && ry(rW) < noseY - 0.05) {
        // Two palms pushed out: the energy blast fires only once they have been held out for blastHold.
        const palm = { kind: 'palm' as const, hand: 'B' as Hand, speed: Math.max(a.speed, bAction.speed), t };
        this.blastPending = { a: palm, since: t };
        held.push(palm);
        return;
      }
      // Two different strikes at once: keep the stronger one.
      const keep = a.speed >= bAction.speed ? { kind: a.kind, hand: a.hand as Hand, speed: a.speed } : bAction;
      emitSingle({ ...keep, t });
    };
    const cands = [...byHand.values()];
    // Any candidate blocks the same hand briefly (one motion, one decision); the full refractory starts only when a strike is emitted.
    for (const c of cands) this.lastCandidate[c.hand] = c.t;
    // ---- held jab: resolve before this frame's candidates ----
    if (this.jabHold) {
      const jh = this.jabHold;
      const o = jh.hand === 'L' ? 'R' : 'L';
      if (suppressAll) this.jabHold = null;
      else if (bothOut(jh.t - gc.reachSync)) {
        // The second arm followed into a reach: fire nothing.
        this.jabHold = null;
        twoArm(jh.a, 'held jab became a reach');
      } else if (t - jh.t >= gc.reachSync || info(jh.hand).ext < gc.holdReachExt || (info(o).extRate <= 0 && info(o).ext < this.grapple.reachTarget(o, info(o).ext))) {
        // Window over, the jab arm came back, or the other arm stopped short: it was a one-arm jab.
        this.jabHold = null;
        const gWhy = grappleDrop(jh.a);
        if (gWhy) {
          if (this.debugLog) this.debugLog.push(`${t.toFixed(2)} held jab${jh.hand} dropped (grapple): ${gWhy}`);
          this.lastStrike.L = this.lastStrike.R = t;
          grappleDropped = true;
        } else {
          if (this.debugLog) this.debugLog.push(`${t.toFixed(2)} held jab${jh.hand} fired`);
          out.actions.push(jh.a);
        }
      }
    }
    if (suppressAll) {
      this.pending = null;
    } else if (cands.length === 2) {
      this.pending = null;
      decideBilateral(cands[0], cands[1]);
    } else if (cands.length === 1) {
      const c = cands[0];
      if (this.jabHold && this.jabHold.hand !== c.hand) {
        // The other arm struck too while the jab was held: decide them together.
        const jh = this.jabHold;
        this.jabHold = null;
        decideBilateral(c, { hand: jh.hand, a: jh.a, t: jh.t });
      } else if (this.pending && this.pending.hand !== c.hand && t - this.pending.t <= this.cfg.palmPairWindow) {
        const p = this.pending;
        this.pending = null;
        decideBilateral(c, p);
      } else if (c.big && c.speed >= this.cfg.bigSwingSpeed && !this.xshield && !this.blocking) {
        // A big fast swing (arbiter-confirmed hook/uppercut): its follow-through carries the arms across the face, which
        // looks like a block or X forming. Defenses form slowly; this fires now (drill session 2dd3adbd, exact timing).
        emitSingle({ kind: c.kind, hand: c.hand, speed: c.speed, t: c.t });
      } else if (otherSpeed(c.hand) > this.cfg.bilateralSpeed || defensiveEnd) {
        // The other hand is moving too: wait briefly to see if this is a two-handed move.
        this.pending = { hand: c.hand, a: { kind: c.kind, hand: c.hand, speed: c.speed }, t };
      } else {
        emitSingle({ kind: c.kind, hand: c.hand, speed: c.speed, t: c.t });
      }
    }
    if (this.pending && t - this.pending.t > this.cfg.palmPairWindow) {
      // Window passed with no partner: emit unless the arms ended in a defensive pose.
      const p = this.pending;
      this.pending = null;
      if (!defensiveEnd && !this.blocking && !this.xshield) emitSingle({ ...p.a, t: p.t });
    }
    // ---- pending energy blast ----
    if (this.blastPending) {
      const bp = this.blastPending;
      const pulledIn = hL.ext < gc.pullExt && hR.ext < gc.pullExt && len(sub(lW, rW)) < gc.pullGap * SW;
      const fwd = Math.min(hL.W[2] - hL.S[2], hR.W[2] - hR.S[2]) / this.calib.armLen;
      if (suppressAll || pulledIn || Math.min(hL.ext, hR.ext) < gc.blastHoldExt || Math.min(hL.elbow, hR.elbow) < gc.holdElbowMin || fwd < gc.blastHoldFwd) {
        if (this.debugLog) this.debugLog.push(`${t.toFixed(2)} blast cancelled: ${pulledIn ? 'pull-in pose' : suppressAll ? 'suppressed' : `palms not held out (ext ${Math.min(hL.ext, hR.ext).toFixed(2)} elbow ${Math.min(hL.elbow, hR.elbow).toFixed(0)} fwd ${fwd.toFixed(2)})`}`);
        this.blastPending = null;
      } else if (t - bp.since >= gc.blastHold) {
        this.blastPending = null;
        out.actions.push(bp.a);
      }
    }
    for (const a of [...held, ...out.actions.slice(nBefore)]) {
      if (a.hand === 'L' || a.hand === 'R') (this.lastStrike[a.hand] = a.t), (this.lastStrikeKind[a.hand] = a.kind);
      else if (a.hand === 'B') this.lastStrike.L = this.lastStrike.R = a.t;
    }

    const handsSlow = handInfo.every((h) => h.speed < 2.5);
    [this.blocking, this.blockOnAt, this.blockOffAt] = hysteresis(blockPose && handsSlow, this.blocking, t, this.blockOnAt, this.blockOffAt, this.cfg.blockHold, this.cfg.blockRelease);
    [this.xshield, this.xOnAt, this.xOffAt] = hysteresis(xPose && handsSlow, this.xshield, t, this.xOnAt, this.xOffAt, this.cfg.xHold, this.cfg.xRelease);
    const wasHigh = this.xHigh;
    [this.xHigh, this.xhOnAt, this.xhOffAt] = hysteresis(xHighPose && handsSlow, this.xHigh, t, this.xhOnAt, this.xhOffAt, this.cfg.xHold, this.cfg.xRelease);
    if (this.xHigh && !wasHigh) out.actions.push({ kind: 'xshield', hand: 'B', speed: 0, t });
    out.blocking = this.blocking;
    out.xshield = this.xHigh;

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
    const leanStrafe = deadzone(lean, this.cfg.leanDead, this.cfg.leanFull);
    // Step sideways: the hip center (shoulder center when the hips are out of frame) moves across the image.
    // Raw (unmirrored) image +x is the player's own left, which is strafe +1 (the fighter's own left on screen).
    const hipVis = Math.min(frame.image[23][3], frame.image[24][3]);
    const hipXRaw = hipVis > 0.5 && frame.image[23][1] < 0.98 ? (frame.image[23][0] + frame.image[24][0]) / 2 : imgCX;
    const kHip = this.hipXS < 0 || this.lastMoveT < 0 ? 1 : Math.min(1, (t - this.lastMoveT) / this.cfg.moveSmooth);
    this.hipXS += (hipXRaw - this.hipXS) * kHip;
    if (this.calib.imgHipX == null) {
      this.hipXSamples.push(hipXRaw);
      if (this.hipXSamples.length >= 15) this.calib.imgHipX = [...this.hipXSamples].sort((a, b) => a - b)[7];
    }
    const m = this.cfg.edgeMargin;
    out.edge = this.hipXS > 1 - m ? 'left' : this.hipXS < m ? 'right' : null;
    const hipX = Math.min(1 - m, Math.max(m, this.hipXS));
    const stepStrafe = this.calib.imgHipX == null ? 0 : deadzone((hipX - this.calib.imgHipX) / this.calib.imgShoulderW, this.cfg.sideStepDead, this.cfg.sideStepFull);
    const strafe = Math.max(-1, Math.min(1, stepStrafe + leanStrafe));
    // ---- forward/back: apparent size in the image (drill sessions fda75d56 / 2dd3adbd, REVIEW.md 4:25 AM) ----
    // Closer to the camera = larger in the image, whether you step or lean. Size is the log of the shoulder width in
    // the image, corrected for torso rotation (turning for a hook narrows the shoulders; that is not a step back).
    // The world-space torso lean used before read the wrong sign in a third of reps: at a laptop the hips are out of
    // frame and their depth is guessed. Size is measured against your current spot, which follows slow posture drift
    // (you settle closer after calibrating, you sit up between drills) but never a deliberate step.
    const yawNow = Math.atan2(-(lS[2] - rS[2]), lS[0] - rS[0]);
    const sizeRaw = Math.log(Math.max(1e-3, imgSW / Math.max(0.5, Math.cos(yawNow))));
    const k = this.lastMoveT < 0 ? 1 : Math.min(1, (t - this.lastMoveT) / this.cfg.moveSmooth);
    this.lastMoveT = t;
    if (this.sizeBase == null) {
      this.sizeBase = Math.log(this.calib.imgShoulderW);
      this.sizeS = sizeRaw;
    }
    // A twisted torso (|yaw| > 35 deg) makes shoulder width unreliable: keep the last good value.
    if (Math.abs(yawNow) < this.cfg.stepMaxYaw) this.sizeS += (sizeRaw - this.sizeS) * k;
    this.sizeHist.push({ t, v: this.sizeS });
    while (this.sizeHist.length && t - this.sizeHist[0].t > this.cfg.spotSettle) this.sizeHist.shift();
    // Your spot = the median size over the last few seconds you stood settled (not mid-strike). You keep coming back to
    // your spot, so a held step or lean never becomes the new spot, while a lasting shift (settling closer right after
    // calibrating, sitting up between drills) takes over within a few seconds.
    const strikeQuiet = t < this.moveQuietUntil;
    if (!strikeQuiet && this.sizeHist.length > 2 && t - this.sizeHist[0].t >= this.cfg.spotSettle * 0.9) {
      let lo = Infinity, hi = -Infinity;
      for (const h of this.sizeHist) (lo = Math.min(lo, h.v)), (hi = Math.max(hi, h.v));
      if (hi - lo < this.cfg.spotStill) this.spotSamples.push({ t, v: this.sizeS });
    }
    while (this.spotSamples.length && t - this.spotSamples[0].t > this.cfg.spotWindow) this.spotSamples.shift();
    if (this.spotSamples.length >= this.cfg.spotMinSamples) {
      const v = this.spotSamples.map((x) => x.v).sort((x, y) => x - y);
      this.sizeBase = v[v.length >> 1];
    }
    const ratio = this.sizeS - this.sizeBase;
    const stepFwd = deadzone(ratio, this.cfg.stepDead, this.cfg.stepFull);
    // Stepping or leaning sideways changes your size in the image a little, which read as diagonal drift in the drills:
    // while strafing harder than moving forward/back, a weak forward/back is dropped.
    let fwd = stepFwd;
    if (Math.abs(strafe) > Math.abs(fwd) && Math.abs(fwd) < this.cfg.diagonalMin) fwd = 0;
    const leanZ = MS[2] - midHip[2];
    const leanFwd = 0;
    const torsoImgDbg = Math.hypot((frame.image[11][0] + frame.image[12][0]) / 2 - (frame.image[23][0] + frame.image[24][0]) / 2, (frame.image[11][1] + frame.image[12][1]) / 2 - (frame.image[23][1] + frame.image[24][1]) / 2);
    // Strikes: the wind-up and twist start before a strike is detected (at its peak). Gate from the strike's onset
    // (a hand starts moving fast) until 0.35 s after it, and hold movement at its value from just before the onset.
    const armActive = out.actions.length > 0 || grappleDropped || handInfo.some((h) => h.speed > this.cfg.armBusySpeed);
    const wasQuiet = t < this.moveQuietUntil;
    if (armActive) this.moveQuietUntil = Math.max(this.moveQuietUntil, t + this.cfg.moveQuietAfterStrike);
    // After a detected strike the body recovers (leans back, re-squares): longer quiet window.
    if (out.actions.length > 0) this.moveQuietUntil = Math.max(this.moveQuietUntil, t + this.cfg.moveQuietAfterDetect);
    // A strike dropped by a grapple-only rule was still a big arm motion: its recovery is not movement either (grappling
    // on only; grappleDropped is never set with it off).
    if (grappleDropped) this.moveQuietUntil = Math.max(this.moveQuietUntil, t + this.cfg.moveQuietAfterDetect);
    if (armActive && !wasQuiet) {
      const before = this.moveHist.find((h) => h.t >= t - this.cfg.moveHoldLookback) ?? this.moveHist[this.moveHist.length - 1];
      this.heldMove = before ? [before.m[0], before.m[1]] : [0, 0];
    }
    // Forward/back intent must persist briefly before it moves the fighter (filters single-frame jolts).
    const fwdSign = Math.sign(fwd);
    if (fwdSign !== this.fwdSign) {
      this.fwdSign = fwdSign;
      this.fwdSince = t;
    }
    const fwdOut = fwdSign !== 0 && t - this.fwdSince < this.cfg.fwdPersist ? 0 : fwd;
    const live: [number, number] = [strafe, fwdOut];
    this.moveHist.push({ t, m: live });
    while (this.moveHist.length && t - this.moveHist[0].t > 0.6) this.moveHist.shift();
    // During the strike window forward/back is zero (holding a pre-strike value carried stale input through combos);
    // strafe keeps its pre-strike value so circling while jabbing still works.
    out.move = this.blocking ? [0, 0] : t < this.moveQuietUntil ? [this.heldMove[0], 0] : live;
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

    // ---- grappling: detected before strike emission (grappleActs), appended last ----
    for (const k of grappleActs) out.actions.push({ kind: k, hand: 'B', speed: 0, t });

    out.debug = { yaw, lean, ratio, stepFwd, leanFwd, leanZ: leanZ - (this.calib.leanZ ?? 0), size: this.sizeS, spot: this.sizeBase ?? 0, quiet: t < this.moveQuietUntil ? 1 : 0, fwdRaw: fwd, strafeRaw: strafe, torso: torsoImgDbg, lExt: handInfo[0].ext, rExt: handInfo[1].ext, lEl: handInfo[0].elbow, rEl: handInfo[1].elbow, lSp: handInfo[0].speed, rSp: handInfo[1].speed };
    return out;
  }

  /** Torso turn (deg) within hand h's strike window, as the big-swing arbiter measures it. */
  private strikeTurnDeg(h: 'L' | 'R') {
    const F = this.feat[h];
    if (!F.length) return 0;
    const tEnd = F[F.length - 1].t;
    let yaw0: number | null = null, lo = Infinity, hi = -Infinity;
    for (const f of F) {
      if (tEnd - f.t > this.cfg.riseWindow + 0.05) continue;
      if (yaw0 == null) yaw0 = f.yaw;
      const d = wrapRad(f.yaw - yaw0);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return ((hi - lo) * 180) / Math.PI;
  }

  /** Both wrists rose by a similar, large amount within the strike window (a two-arm move). */
  private bothRising() {
    const rise = (h: 'L' | 'R') => {
      const F = this.feat[h];
      if (F.length < 2) return 0;
      const tEnd = F[F.length - 1].t;
      let lo = Infinity, best = 0;
      for (const f of F) {
        if (tEnd - f.t > this.cfg.riseWindow + 0.05) continue;
        lo = Math.min(lo, f.y);
        best = Math.max(best, f.y - lo);
      }
      return best;
    };
    const a = rise('L'), b = rise('R');
    return Math.min(a, b) >= this.cfg.twoArmRise && Math.min(a, b) >= 0.5 * Math.max(a, b);
  }

  private flushPending(t: number, out: GestureOutput, force: boolean) {
    if (this.pending && (force || t - this.pending.t > this.cfg.palmPairWindow)) {
      out.actions.push({ ...this.pending.a, t: this.pending.t });
      this.pending = null;
    }
    if (force) {
      // Tracking lost: a held jab fires like a pending strike; a blast that was not held out for long enough does not.
      if (this.jabHold) out.actions.push(this.jabHold.a);
      this.jabHold = null;
      this.blastPending = null;
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
    const shoulderAtEdge = [11, 12].some((i) => frame.image[i][0] < 0.03 || frame.image[i][0] > 0.97);
    if (imgSW > 0.42 || ((!noseVis || shoulderAtEdge) && imgSW > 0.3)) guidance = 'Step back: too close to the camera';
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
    const hipM = mid(P[J.lHip], P[J.rHip]);
    const hv = Math.min(frame.image[23][3], frame.image[24][3]) > 0.5 && frame.image[23][1] < 0.98;
    this.calibFrames.push({ t, sw: len(sub(lS, rS)), arm, isw: imgSW, cx: imgCX, lz: MS[2] - hipM[2], hx: hv ? (frame.image[23][0] + frame.image[24][0]) / 2 : imgCX });
    const progress = Math.min(1, (t - this.calibStart) / 3);
    if (progress >= 1 && this.calibFrames.length >= 10) {
      const med = (k: 'sw' | 'arm' | 'isw' | 'cx' | 'lz' | 'hx') => {
        const a = this.calibFrames.map((f) => f[k]).sort((x, y) => x - y);
        return a[Math.floor(a.length / 2)];
      };
      this.sizeBase = null;
      this.sizeHist = [];
      // The guard hold is 3 s of you standing on your spot: it seeds the spot median, so an early held lean can't take over.
      // (Each frame is stamped with its own time, so these age out of the window like any other sample.)
      this.spotSamples = this.calibFrames.map((f) => ({ t: f.t, v: Math.log(f.isw) }));
      this.calib = { shoulderW: med('sw'), armLen: Math.max(0.4, med('arm')), imgShoulderW: med('isw'), imgCenterX: med('cx'), leanZ: med('lz'), imgHipX: med('hx') };
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
