// Repro: local 2-player, the first pose frame holds only ONE of the two people (one steps in first, or the detector
// finds the second person a frame later). SPEC P0: the left person (mirrored preview) controls fighter 1 (slot 0), the
// right person fighter 2 (slot 1). The assigner put a lone first person into slot 0 whatever side they stood on, and
// the swap then stuck for the whole match (seen in e2e local2p.spec.ts:28 under load, 2026-10-25).
import { PeopleAssigner, type PosePerson } from '../../shared/assign';

// A person whose shoulder midpoint is at raw image x = cx (raw = unmirrored: raw right = mirrored left = slot 0).
function person(cx: number, scale = 1): PosePerson {
  const image = Array.from({ length: 33 }, () => [cx, 0.5, 0, 1]);
  image[11] = [cx + 0.05, 0.3, 0, 1];
  image[12] = [cx - 0.05, 0.3, 0, 1];
  const world = Array.from({ length: 33 }, () => [0, 0, 0, 1]);
  world[11] = [0.18 * scale, -0.5, 0, 1];
  world[12] = [-0.18 * scale, -0.5, 0, 1];
  world[23] = [0.1 * scale, 0, 0, 1];
  world[13] = [0.25 * scale, -0.25, 0, 1];
  world[15] = [0.3 * scale, 0, 0, 1];
  world[0] = [0, -0.7 * scale, 0, 1];
  return { image, world };
}

const LEFT = 0.72; // raw right = mirrored left = player 1 (slot 0)
const RIGHT = 0.28; // raw left = mirrored right = player 2 (slot 1)
let fails = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) fails++;
}
const slotOf = (out: (PosePerson | null)[], p: PosePerson) => out.indexOf(p);

for (const first of ['right', 'left'] as const) {
  const a = new PeopleAssigner(2);
  const L = person(LEFT, 1);
  const R = person(RIGHT, 1.1);
  let t = 0;
  // Frame 1: only one person found.
  const out1 = a.assign([first === 'right' ? R : L], t);
  check(`${first} person alone first`, slotOf(out1, first === 'right' ? R : L) === (first === 'right' ? 1 : 0), `slot ${slotOf(out1, first === 'right' ? R : L)}`);
  // Then both, for a few seconds, in either detection order.
  let lastL = -1, lastR = -1;
  for (let i = 0; i < 60; i++) {
    t += 1 / 15;
    const out = a.assign(i % 2 ? [L, R] : [R, L], t);
    lastL = slotOf(out, L);
    lastR = slotOf(out, R);
  }
  check(`${first} first, then both`, lastL === 0 && lastR === 1, `left person slot ${lastL}, right person slot ${lastR}`);
  // The left person leaves (e2e: mask the raw right half): slot 0 must be the empty one.
  t += 1 / 15;
  const out3 = a.assign([R], t);
  check(`${first} first, left person leaves`, out3[0] === null && out3[1] === R, `slots ${out3.map((p) => (p === L ? 'L' : p === R ? 'R' : '-')).join('')}`);
}

// A lone first person near the centre, then the partner appears on the same side further out: still decided by side.
{
  const a = new PeopleAssigner(2);
  const A = person(0.55, 1); // just left of centre in the mirrored preview
  const B = person(0.85, 1.1); // further left
  a.assign([A], 0);
  let out: (PosePerson | null)[] = [];
  for (let i = 1; i <= 30; i++) out = a.assign([A, B], i / 15);
  check('centre first, partner further left', out[0] === B && out[1] === A, `B slot ${slotOf(out, B)}, A slot ${slotOf(out, A)}`);
}

// Existing behaviour that must hold: both found at once are sorted by side; a crossing keeps identities.
{
  const a = new PeopleAssigner(2);
  const L = person(LEFT, 1);
  const R = person(RIGHT, 1.1);
  const out = a.assign([R, L], 0);
  check('both at once', out[0] === L && out[1] === R, `L slot ${slotOf(out, L)}`);
}

process.exitCode = fails ? 1 : 0;
console.log(fails ? `${fails} failed` : 'all passed');
