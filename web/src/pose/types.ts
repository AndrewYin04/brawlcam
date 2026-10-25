/** One landmark: x, y, z, visibility. Image coords are normalized 0..1; world coords are meters, hip-centered. */
export type LM = [number, number, number, number];

export interface PosePerson {
  image: LM[];
  world: LM[];
}

export type WorkerIn =
  | { type: 'init'; numPoses: number; forceCpu?: boolean }
  | { type: 'numPoses'; numPoses: number }
  | { type: 'frame'; bitmap: ImageBitmap; ts: number };

export type WorkerOut =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'error'; message: string; fatal?: boolean }
  | { type: 'result'; ts: number; people: PosePerson[]; inferMs: number; delegate: 'GPU' | 'CPU' };

/** MediaPipe Pose landmark indices. */
export const L = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftIndex: 19,
  rightIndex: 20,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;
