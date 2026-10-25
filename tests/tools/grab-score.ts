// Scores the user's labeled grab reps the way REVIEW.md 6:40 AM asks: each grab rep is a grab, a strike instead (which),
// or nothing; plus whether any strike fired alongside the grab ("clean" = grab and no strike in the rep window). Also the
// false-grab rate on every non-grab drill rep (throw reps excluded: a throw starts with a grab).
// Rep windows are drill-replay.ts's (prompt to 3 s later or the next prompt, as in the live drill).
// Usage: npx tsx tests/tools/grab-score.ts [session ...] [--grapple]
import fs from 'fs';
import path from 'path';
import { replay } from './drill-replay';

const ROOT = path.resolve(import.meta.dirname, '../..');
const STRIKES = new Set(['jab', 'hook', 'uppercut', 'palm']);

export function scoreGrabs(file: string, grapple: boolean) {
  const r = replay(file, { configure: (rec) => (rec.grappleEnabled = grapple) });
  const reps: { rep: number; outcome: 'grab' | 'strike-instead' | 'nothing'; clean: boolean; got: string[] }[] = [];
  let negReps = 0;
  let negGrabs = 0;
  const negHits: string[] = [];
  for (const st of r.stats) {
    for (const x of st.perRep) {
      const kinds = x.got.map((g) => g.replace(/[LR]$/, ''));
      const grab = kinds.includes('grab');
      const strikes = x.got.filter((g) => STRIKES.has(g.replace(/[LR]$/, '')));
      if (st.label === 'grab') reps.push({ rep: x.rep, outcome: grab ? 'grab' : strikes.length ? 'strike-instead' : 'nothing', clean: grab && !strikes.length, got: x.got });
      else if (st.label !== 'throw') {
        negReps++;
        if (grab) (negGrabs++, negHits.push(`${st.label} r${x.rep}`));
      }
    }
  }
  return { name: r.name, reps, negReps, negGrabs, negHits };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const grapple = args.includes('--grapple');
  const names = args.filter((a) => !a.startsWith('--'));
  const files = (names.length ? names : fs.readdirSync(path.join(ROOT, 'clips/research')).map((f) => f.replace('.json', ''))).map((n) => path.join(ROOT, 'clips/research', n.endsWith('.json') ? n : n + '.json'));
  console.log(`grappleEnabled=${grapple}`);
  for (const f of files) {
    const s = scoreGrabs(f, grapple);
    const n = s.reps.length;
    const c = (o: string) => s.reps.filter((x) => x.outcome === o).length;
    console.log(`${s.name.slice(0, 8)}  grab reps ${n}: grab ${c('grab')}/${n}${n ? ` (${((c('grab') / n) * 100).toFixed(0)}%)` : ''}, strike-instead ${c('strike-instead')}/${n}, nothing ${c('nothing')}/${n}; clean grab (no strike in the rep) ${s.reps.filter((x) => x.clean).length}/${n}, strike alongside ${s.reps.filter((x) => x.outcome === 'grab' && !x.clean).length}/${n}`);
    for (const x of s.reps) console.log(`   r${x.rep} ${x.outcome}${x.outcome === 'grab' && !x.clean ? ' + strike' : ''}  [${x.got.join(' ')}]`);
    console.log(`   false grabs on non-grab reps (throw excluded): ${s.negGrabs}/${s.negReps}${s.negHits.length ? ' (' + s.negHits.join(', ') + ')' : ''}`);
  }
}
