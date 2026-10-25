// Hand-pointing movement prototype on real landmarks: a held straight arm should produce movement; a jab should not.
import fs from 'fs';
import path from 'path';
import { GestureRecognizer } from '../../shared/gestures';
for (const [clip, expectMove] of [['jab_01', false], ['guard_02', false]] as const) {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../clips/landmarks', clip + '.json'), 'utf8'));
  const r = new GestureRecognizer();
  r.cfg.moveMode = 'point';
  r.skipCalibration({ armLen: 0.5 });
  let moving = 0;
  for (const f of d.frames) { const p = f.people[0]; const o = r.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t); if (o.move[0] || o.move[1]) moving++; }
  console.log(clip, 'frames with point-movement:', moving, '/', d.frames.length, expectMove ? '' : '(expect ~0: jabs and guard must not move you)');
}
