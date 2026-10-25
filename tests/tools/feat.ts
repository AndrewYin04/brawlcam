// Print the recognizer's internal per-hand features for a clip (debugging).
import fs from 'fs';
import path from 'path';
import { GestureRecognizer } from '../../shared/gestures';
const [name, hand = 'L', from = '0', to = '99', stride = '1'] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../clips/landmarks', name + '.json'), 'utf8'));
const rec = new GestureRecognizer();
rec.skipCalibration({ armLen: Number(process.env.ARM ?? 0.5) });
for (const [i, f] of d.frames.entries()) {
  if (i % Number(stride)) continue;
  const p = f.people[0];
  const out = rec.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t);
  const F = (rec as any).feat[hand];
  const last = F[F.length - 1];
  if (f.t >= Number(from) && f.t <= Number(to) && last) console.log(f.t.toFixed(2), 'ext', last.ext.toFixed(2), 'elb', last.elbow.toFixed(0), 'y', last.y.toFixed(2), 'u', last.u.toFixed(2), 'sp', last.speed.toFixed(1), out.actions.map((a) => a.kind + a.hand).join(','));
}
