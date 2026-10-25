// Leaderboard from Tiger Data (Elo, wins, KOs, fastest punch, damage per minute).
import { show } from '../main';
import { clientId } from '../net/online';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export async function showLeaderboard() {
  const page = $('page');
  page.innerHTML = `<h2>🏆 Leaderboard</h2><p class="muted">Ranked by Elo from online matches. Stats come from Tiger Data continuous aggregates.</p><div id="lb">Loading…</div><div class="row"><button class="btn ghost" data-action="menu">Back</button></div>`;
  show('page');
  const box = $('lb');
  let data: any = null;
  try {
    const r = await fetch('/api/leaderboard');
    data = r.ok ? await r.json() : { error: (await r.json().catch(() => ({})))?.message ?? 'unavailable' };
  } catch {
    data = { error: 'offline' };
  }
  box.innerHTML = '';
  if (!data || data.error) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.id = 'lb-error';
    p.textContent = 'The leaderboard is taking a breather right now. Your games still work. Try again in a bit!';
    box.appendChild(p);
    return;
  }
  const players = (data.players ?? []).filter((p: any) => !String(p.nickname).startsWith('E2E '));
  if (!players.length) {
    const p = document.createElement('p');
    p.id = 'lb-empty';
    p.textContent = 'No ranked fights yet. Fight a friend online to claim the top spot!';
    box.appendChild(p);
    return;
  }
  const t = document.createElement('table');
  t.className = 'lb';
  t.innerHTML = '<thead><tr><th>#</th><th>Fighter</th><th>Elo</th><th>W-L</th><th>KOs</th><th>Fastest punch</th><th>Dmg/min</th></tr></thead>';
  const tb = document.createElement('tbody');
  const me = clientId();
  players.forEach((p: any, i: number) => {
    const tr = document.createElement('tr');
    if (p.id === me) tr.style.color = 'var(--gold)';
    for (const v of [String(i + 1), p.tag ? `${p.nickname} ${p.tag}` : p.nickname, String(p.elo), `${p.wins}-${p.losses}`, String(p.kos), p.fastest_punch ? `${Number(p.fastest_punch).toFixed(1)} m/s` : '-', String(p.dmg_per_min)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  box.appendChild(t);
}
