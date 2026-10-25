// Guided research drills (REVIEW.md 2:55/2:58 AM): only your fighter in the octagon, one large prompt at a time.
// Each rep ends when the detector fires the prompted move (✓) or after 3 s (✗, a miss); other moves in the window are
// extra (false) detections. Labels come from the script, not from keys. Sections: stand still (20 s), big punches
// standing still (bug A), movement in each direction. Results per section, a summary, then the files save.
import type { PoseInput } from './input/players';
import { research } from './research';

type Rep = { label: string; text: string; expect: { kind: string; hand?: 'L' | 'R' } | { dir: 'fwd' | 'back' | 'left' | 'right' } };
type Section = { name: string; note: string; still?: number; reps?: Rep[] };

const shuffle = <T,>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const times = (n: number, r: Rep) => Array.from({ length: n }, () => r);

export function drillScript(): Section[] {
  return [
    { name: 'Stand still', note: 'Guard up, feet planted. Ground truth for "no movement".', still: 20 },
    {
      name: 'Big punches, standing still',
      note: "Throw big punches but DON'T STEP. Your fighter should not move.",
      reps: shuffle([
        ...times(4, { label: 'hook_R_big', text: 'THROW A BIG RIGHT HOOK', expect: { kind: 'hook', hand: 'R' } }),
        ...times(4, { label: 'hook_L_big', text: 'THROW A BIG LEFT HOOK', expect: { kind: 'hook', hand: 'L' } }),
        ...times(4, { label: 'straight_big', text: 'THROW A BIG STRAIGHT PUNCH', expect: { kind: 'jab' } }),
        ...times(3, { label: 'uppercut_big', text: 'THROW AN UPPERCUT', expect: { kind: 'uppercut' } }),
      ]),
    },
    ...(new URLSearchParams(location.search).has('grapple')
      ? [
          {
            name: 'Grab and Shoulder Throw (beta)',
            note: 'Grab: reach both arms forward, then pull them in to your chest. Throw: reach, then twist and bend forward.',
            reps: shuffle([
              ...times(4, { label: 'grab', text: 'GRAB: REACH BOTH ARMS, PULL IN', expect: { kind: 'grab' } }),
              ...times(4, { label: 'throw', text: 'SHOULDER THROW: REACH, TWIST, BEND', expect: { kind: 'throw' } }),
            ]),
          } as Section,
        ]
      : []),
    {
      name: 'Movement',
      note: 'Step or lean as asked, then come back to your spot.',
      reps: shuffle([
        ...times(3, { label: 'step_fwd', text: 'STEP TOWARD THE CAMERA', expect: { dir: 'fwd' } }),
        ...times(3, { label: 'step_back', text: 'STEP BACK', expect: { dir: 'back' } }),
        ...times(3, { label: 'lean_fwd', text: 'LEAN TOWARD THE CAMERA', expect: { dir: 'fwd' } }),
        ...times(3, { label: 'lean_back', text: 'LEAN BACK', expect: { dir: 'back' } }),
        ...times(3, { label: 'step_left', text: 'STEP TO YOUR LEFT', expect: { dir: 'left' } }),
        ...times(3, { label: 'step_right', text: 'STEP TO YOUR RIGHT', expect: { dir: 'right' } }),
        ...times(3, { label: 'lean_left', text: 'LEAN TO YOUR LEFT', expect: { dir: 'left' } }),
        ...times(3, { label: 'lean_right', text: 'LEAN TO YOUR RIGHT', expect: { dir: 'right' } }),
      ]),
    },
  ];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDrills(pose: PoseInput, onDone: () => void) {
  const script = drillScript();
  const total = script.reduce((n, s) => n + (s.reps?.length ?? 1), 0);
  const el = document.createElement('div');
  el.id = 'drill';
  el.innerHTML = `<div class="drill-card"><div class="drill-sec" id="drill-sec"></div><div class="drill-prompt" id="drill-prompt">Get ready</div>
    <div class="drill-flash" id="drill-flash"></div><div class="drill-bar"><i id="drill-fill"></i></div><div class="drill-meta"><span id="drill-count"></span> · <span id="drill-res"></span></div>
    <div class="row"><button class="btn ghost small" id="drill-redo">Redo section</button><button class="btn ghost small" id="drill-skip">Skip section</button><span class="muted">Space = pause</span></div></div>`;
  document.body.appendChild(el);
  const $ = (id: string) => document.getElementById(id)!;
  let paused = false;
  let skip = false;
  let redo = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      paused = !paused;
      $('drill-flash').textContent = paused ? 'PAUSED' : '';
    }
  };
  addEventListener('keydown', onKey);
  $('drill-skip').onclick = () => (skip = true);
  $('drill-redo').onclick = () => (redo = true);

  // Live frame feed (actions and movement input) from the research recorder.
  let lastActions: { kind: string; hand: string }[] = [];
  let move: [number, number] = [0, 0];
  let lastT = performance.now();
  let drift = 0;
  research.frameListener = (_t, _people, outs) => {
    const o = outs[0];
    if (!o) return;
    const now = performance.now();
    const dt = Math.min(0.2, (now - lastT) / 1000);
    lastT = now;
    if (o.actions.length) lastActions.push(...o.actions.map((a: { kind: string; hand: string }) => ({ kind: a.kind, hand: a.hand })));
    move = [o.move[0], o.move[1]];
    // Would-be displacement from movement input (forward/back at 2.4 m/s, strafe at 60% of that).
    drift += (Math.abs(o.move[1]) * 2.4 + Math.abs(o.move[0]) * 1.44) * dt;
  };
  const waitWhilePaused = async () => {
    while (paused) await sleep(100);
  };

  let done = 0;
  const summary: { section: string; asked: number; hit: number; extra: number; drift: number }[] = [];
  const results: Record<string, { asked: number; hit: number; extra: number }> = {};
  for (let si = 0; si < script.length; si++) {
    const sec = script[si];
    redo = skip = false;
    $('drill-sec').textContent = `${sec.name}: ${sec.note}`;
    drift = 0;
    let asked = 0, hit = 0, extra = 0;
    if (sec.still) {
      research.setLabel('still', 0);
      for (let t = sec.still; t > 0 && !skip && !redo; t--) {
        await waitWhilePaused();
        $('drill-prompt').textContent = `STAND STILL · ${t}`;
        $('drill-fill').style.width = `${(done / total) * 100}%`;
        await sleep(1000);
      }
      research.setLabel(null, 0);
      done++;
    } else {
      for (let ri = 0; ri < (sec.reps ?? []).length && !skip && !redo; ri++) {
        const rep = sec.reps![ri];
        await waitWhilePaused();
        $('drill-prompt').textContent = rep.text;
        $('drill-flash').textContent = '';
        $('drill-count').textContent = `${done + 1} / ${total}`;
        $('drill-fill').style.width = `${(done / total) * 100}%`;
        research.setLabel(rep.label, ri + 1);
        lastActions = [];
        const t0 = performance.now();
        let ok = false;
        let held = 0;
        while (performance.now() - t0 < 3000 && !ok && !skip && !redo) {
          await sleep(50);
          if ('kind' in rep.expect) {
            const e = rep.expect;
            const match = lastActions.findIndex((a) => a.kind === e.kind && (!e.hand || a.hand === e.hand));
            if (match >= 0) {
              ok = true;
              extra += lastActions.length - 1;
            }
          } else {
            const d = rep.expect.dir;
            const on = d === 'fwd' ? move[1] > 0.3 : d === 'back' ? move[1] < -0.3 : d === 'left' ? move[0] > 0.3 : move[0] < -0.3;
            held = on ? held + 0.05 : 0;
            if (held >= 0.3) ok = true;
          }
        }
        if (!ok && 'kind' in rep.expect) extra += lastActions.length;
        asked++;
        if (ok) hit++;
        research.setLabel(null, 0);
        research.markRep(rep.label, ri + 1, ok);
        $('drill-flash').textContent = ok ? `✓ ${rep.label.replace(/_/g, ' ')}` : '✗ missed';
        $('drill-flash').className = 'drill-flash ' + (ok ? 'ok' : 'miss');
        done++;
        await sleep(800);
      }
    }
    if (redo) {
      done -= sec.reps ? asked : 1;
      si--;
      continue;
    }
    const cm = Math.round(drift * 100);
    const line = sec.still ? `stood still 20 s · movement input ${cm} cm` : sec.name.startsWith('Big') ? `${asked} asked · ${hit} detected · ${extra} extra · you drifted ${cm} cm` : `${asked} asked · ${hit} detected`;
    $('drill-res').textContent = line;
    summary.push({ section: sec.name, asked, hit, extra, drift: cm });
    results[sec.name] = { asked, hit, extra };
    await sleep(1500);
  }
  research.frameListener = null;
  removeEventListener('keydown', onKey);
  // Summary table, then save the files.
  const rows = summary.map((s) => `<tr><td>${s.section}</td><td>${s.asked || '-'}</td><td>${s.asked ? s.hit : '-'}</td><td>${s.asked ? s.extra : '-'}</td><td>${s.section === 'Movement' ? '-' : s.drift + ' cm'}</td></tr>`).join('');
  el.querySelector('.drill-card')!.innerHTML = `<h2>Drills done</h2><table class="lb"><tr><th>Section</th><th>Asked</th><th>Detected</th><th>Extra</th><th>Drift</th></tr>${rows}</table><p class="muted">Saving your files…</p><button class="btn primary" id="drill-close">Back to menu</button>`;
  (window as any).__brawl && ((window as any).__brawl.drills = summary);
  await research.finish();
  $('drill-close').onclick = () => {
    el.remove();
    onDone();
  };
}
