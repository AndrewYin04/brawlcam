// Print strike candidates and suppression decisions for a clip time range.
import fs from 'fs'; import path from 'path';
import { GestureRecognizer } from '../../shared/gestures';
const [name, from = '0', to = '99'] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../clips/landmarks', name + '.json'), 'utf8'));
const r = new GestureRecognizer(); r.debugLog = []; r.skipCalibration({ armLen: 0.5 });
for (const f of d.frames) { const p = f.people[0]; const o = r.update(p ? { t: f.t, world: p.world, image: p.image } : null, f.t); for (const a of o.actions) r.debugLog.push(`${f.t.toFixed(2)} ACTION ${a.kind}${a.hand}`); }
for (const l of r.debugLog) { const t = Number(l.split(' ')[0]); if (t >= Number(from) && t <= Number(to)) console.log(l); }
