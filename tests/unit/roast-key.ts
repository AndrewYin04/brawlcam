// Which pre-voiced generic roast plays for a batch of events when the live Gemini line is caption-only.
import { roastKey } from '../../web/src/game/commentary';
let fail = false;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail = true; };
const snap = (hp1: number, hp2: number) => ({ f: [{ id: 1, hp: hp1 }, { id: 2, hp: hp2 }] }) as any;
const hit = (attacker: number, target: number, damage: number, blocked = false, isSuper = false) => ({ type: 'hit', attacker, target, damage, blocked, isSuper, kind: 'jab' }) as any;
check(roastKey([hit(1, 2, 8), { type: 'ko', attacker: 1, target: 2, kind: 'jab' } as any], 0, snap(80, 0)) === 'roast_ko', 'KO in the batch -> roast_ko');
check(roastKey([{ type: 'guard_break', id: 2, attacker: 1 } as any], 0, snap(90, 90)) === 'roast_guard_break', 'guard break -> roast_guard_break');
check(roastKey([hit(1, 2, 9)], 0, snap(30, 80)) === 'roast_comeback', 'the fighter 50 HP behind lands -> roast_comeback');
check(roastKey([hit(1, 2, 14)], 0, snap(80, 70)) === 'roast_big_hit', '14-damage hit -> roast_big_hit');
check(roastKey([hit(1, 2, 20, false, true)], 0, snap(80, 70)) === 'roast_big_hit', 'super hit -> roast_big_hit');
check(roastKey([], 3, snap(80, 80)) === 'roast_whiff', 'three whiffs -> roast_whiff');
check(roastKey([hit(1, 2, 1, true), hit(1, 2, 1, true), hit(2, 1, 6)], 0, snap(80, 80)) === 'roast_blocked', 'mostly blocked punches -> roast_blocked');
check(roastKey([{ type: 'round_start', n: 1 } as any], 0, snap(100, 100)) === 'roast_idle', 'nothing landed -> roast_idle');
if (fail) process.exitCode = 1;
