// Turns a window of game events into a short plain-text summary for the commentator model.
import type { SimEvent, Snapshot } from './sim';

export function summarize(events: SimEvent[], snap: Snapshot): string {
  const name = (id: number | null | undefined) => snap.f.find((f) => f.id === id)?.name ?? 'someone';
  const parts: string[] = [];
  const hits = events.filter((e) => e.type === 'hit') as Extract<SimEvent, { type: 'hit' }>[];
  const byAtt = new Map<number, { n: number; dmg: number; kinds: Set<string>; blocked: number }>();
  for (const h of hits) {
    const a = byAtt.get(h.attacker) ?? { n: 0, dmg: 0, kinds: new Set(), blocked: 0 };
    a.n++;
    a.dmg += h.damage;
    a.kinds.add(h.kind);
    if (h.blocked) a.blocked++;
    byAtt.set(h.attacker, a);
  }
  for (const [id, a] of byAtt) parts.push(`${name(id)} landed ${a.n} hit(s) (${[...a.kinds].join(', ')}) for ${a.dmg} damage${a.blocked ? `, ${a.blocked} blocked` : ''}.`);
  const superName: Record<string, string> = { uppercut: 'super uppercut', ironwall: 'Iron Wall', blast: 'energy blast', throw: 'Shoulder Throw' };
  for (const e of events) {
    if (e.type === 'super') parts.push(`${name(e.id)} fired a SUPER: ${superName[e.kind] ?? e.kind}!`);
    if (e.type === 'guard_break') parts.push(e.attacker != null ? `${name(e.attacker)} BROKE ${name(e.id)}'s guard, ${name(e.id)} is dizzy!` : `${name(e.id)} held the guard too long and it shattered, ${name(e.id)} is dizzy!`);
    if (e.type === 'iron_counter') parts.push(`${name(e.attacker)} hit ${name(e.id)}'s Iron Wall and got countered!`);
    if (e.type === 'ko') parts.push(e.attacker != null ? `${name(e.attacker)} KO'd ${name(e.target)} with a ${e.kind}${e.ringout ? ' (ring out)' : ''}!` : `${name(e.target)} fell out of the ring!`);
    // Grappling (beta flag)
    if (e.type === 'grab') parts.push(`${name(e.id)} reaches to grab ${name(e.target)}!`);
    if (e.type === 'grab_cancel') parts.push(e.reason === 'hit' ? `${name(e.id)} got punched out of the ${e.k === 't' ? 'throw' : 'grab'}!` : e.reason === 'iron' ? `${name(e.id)}'s grab bounced off the Iron Wall!` : `${name(e.id)}'s grab came up empty.`);
    if (e.type === 'clinch_start') parts.push(`${name(e.holder)} has ${name(e.held)} locked in the clinch!`);
    if (e.type === 'clinch_end' && e.reason !== 'throw') parts.push(e.reason === 'escape' ? `${name(e.held)} breaks free of the clinch!` : e.reason === 'timeout' ? `The referee separates ${name(e.holder)} and ${name(e.held)}.` : `The clinch between ${name(e.holder)} and ${name(e.held)} is broken up.`);
    if (e.type === 'throw') parts.push(`${name(e.id)} hits a SHOULDER THROW, slamming ${name(e.target)} for ${e.damage} damage!`);
    if (e.type === 'round_start') parts.push(`Round ${e.n} is starting.`);
    if (e.type === 'match_over') parts.push(e.winner != null ? `${name(e.winner)} wins the match!` : 'The match is a draw.');
  }
  const hp = snap.f.slice(0, 8).map((f) => `${f.name} ${f.hp} HP${f.meter >= 100 ? ' (super ready)' : ''}`).join(', ');
  return `${parts.join(' ')} Status: ${hp}. ${snap.f.length > 2 ? 'Free-for-all brawl.' : `Round ${snap.round}, ${Math.ceil(snap.timer)} s left.`}`;
}

