// Compact body pose shared by the pose solver, bots, the network, and the avatar driver.
// Positions are in "avatar space": meters, origin at hip center, +X = the person's own left,
// +Y = up, +Z = the person's forward (toward the camera for a webcam player).

export const J = {
  nose: 0,
  lEar: 1,
  rEar: 2,
  lSh: 3,
  rSh: 4,
  lEl: 5,
  rEl: 6,
  lWr: 7,
  rWr: 8,
  lHip: 9,
  rHip: 10,
  lKnee: 11,
  rKnee: 12,
  lAnk: 13,
  rAnk: 14,
} as const;
export const JOINT_COUNT = 15;

/** MediaPipe Pose landmark index for each joint above. */
export const MP_INDEX = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export type V3 = [number, number, number];

export interface Joints {
  p: V3[]; // JOINT_COUNT positions
  legs: boolean; // knees and ankles reliably visible
}

/** MediaPipe world landmark (x right in image, y down, z away from camera) to avatar space. */
export function mpWorldToAvatar(x: number, y: number, z: number): V3 {
  // Person faces the camera: image +x is the person's left (+X), image down is -Y,
  // smaller z is closer to the camera, i.e. the person's forward (+Z).
  return [x, -y, -z];
}

/** Quantize to centimeters for the wire. */
export function packJoints(j: Joints): number[] {
  const out: number[] = new Array(JOINT_COUNT * 3 + 1);
  for (let i = 0; i < JOINT_COUNT; i++) {
    out[i * 3] = Math.round(j.p[i][0] * 100);
    out[i * 3 + 1] = Math.round(j.p[i][1] * 100);
    out[i * 3 + 2] = Math.round(j.p[i][2] * 100);
  }
  out[JOINT_COUNT * 3] = j.legs ? 1 : 0;
  return out;
}

export function unpackJoints(a: number[] | undefined | null): Joints | null {
  if (!a || a.length < JOINT_COUNT * 3) return null;
  const p: V3[] = [];
  for (let i = 0; i < JOINT_COUNT; i++) p.push([a[i * 3] / 100, a[i * 3 + 1] / 100, a[i * 3 + 2] / 100]);
  return { p, legs: a[JOINT_COUNT * 3] === 1 };
}

/** A neutral fighting guard, used for idle fighters, bots, and as a fallback. */
export function guardJoints(): Joints {
  return {
    legs: true,
    p: [
      [0, 0.62, 0.08], // nose
      [0.07, 0.62, 0.0], // lEar
      [-0.07, 0.62, 0.0], // rEar
      [0.18, 0.48, 0.0], // lSh
      [-0.18, 0.48, 0.0], // rSh
      [0.24, 0.22, 0.12], // lEl
      [-0.24, 0.22, 0.12], // rEl
      [0.11, 0.5, 0.28], // lWr
      [-0.11, 0.5, 0.26], // rWr
      [0.1, 0, 0], // lHip
      [-0.1, 0, 0], // rHip
      [0.13, -0.42, 0.05], // lKnee
      [-0.13, -0.42, -0.02], // rKnee
      [0.14, -0.84, 0.0], // lAnk
      [-0.14, -0.84, -0.06], // rAnk
    ],
  };
}

export function lerpJoints(a: Joints, b: Joints, t: number): Joints {
  const p: V3[] = a.p.map((pa, i) => {
    const pb = b.p[i];
    return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
  });
  return { p, legs: t < 0.5 ? a.legs : b.legs };
}

export function cloneJoints(a: Joints): Joints {
  return { p: a.p.map((v) => [v[0], v[1], v[2]] as V3), legs: a.legs };
}
