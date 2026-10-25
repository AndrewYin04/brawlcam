// Store: skins, auras, season pass (mock purchases), and the motion-data consent setting.
import { show, toast } from '../main';
import { showConsent, motionConsent } from './consent';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const SKINS = [
  { id: 'crimson', name: 'Crimson Comet', color: '#ff3d6e', price: 0, kind: 'skin' },
  { id: 'azure', name: 'Azure Storm', color: '#33b5ff', price: 2, kind: 'skin' },
  { id: 'gold', name: 'Golden Gloves', color: '#ffc53d', price: 4, kind: 'skin' },
  { id: 'venom', name: 'Venom Green', color: '#3dff9a', price: 4, kind: 'skin' },
  { id: 'void', name: 'Void Walker', color: '#b03dff', price: 6, kind: 'skin' },
  { id: 'magma', name: 'Magma Core', color: '#ff7a3d', price: 6, kind: 'skin' },
  { id: 'frost', name: 'Frost Byte', color: '#3dfff0', price: 8, kind: 'skin' },
  { id: 'pearl', name: 'Pearl Champion', color: '#f5f5f5', price: 10, kind: 'skin' },
];

function owned(): string[] {
  try {
    return JSON.parse(localStorage.getItem('throwhands.owned') ?? '["crimson"]');
  } catch {
    return ['crimson'];
  }
}
function setOwned(list: string[]) {
  try {
    localStorage.setItem('throwhands.owned', JSON.stringify([...new Set(list)]));
  } catch {}
}
export function equipped(): string {
  try {
    return localStorage.getItem('throwhands.skin') ?? 'crimson';
  } catch {
    return 'crimson';
  }
}

export function showStore() {
  const page = $('page');
  page.innerHTML = `
    <h2>🛒 Store</h2>
    <p class="muted">Skins change your fighter's suit and glove glow. <b>Demo: no charge</b>. Purchases here are simulated.</p>
    <div class="card" style="margin-bottom:12px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;background:linear-gradient(135deg,rgba(255,61,110,.18),rgba(255,197,61,.12))">
      <div style="font-size:40px">🎟️</div>
      <div style="flex:1;min-width:200px"><b>Season 1 Pass: $5/month</b><div class="muted">All season skins, a Forge credit every week, ranked play badges, and seasonal auras.</div></div>
      <button class="btn primary" id="buy-pass">Get pass (Demo: no charge)</button>
    </div>
    <div class="cards" id="skins"></div>
    <h3 style="margin-top:18px">Your data</h3>
    <div class="card" id="data-card"></div>
    <div class="row"><button class="btn ghost" data-action="menu">Back</button></div>`;
  show('page');
  render();
  $('buy-pass').onclick = () => {
    setOwned([...owned(), ...SKINS.map((s) => s.id)]);
    try {
      localStorage.setItem('throwhands.pass', '1');
    } catch {}
    toast('Season pass active (demo, no charge). All skins unlocked!');
    render();
  };
}

function render() {
  const box = $('skins');
  box.innerHTML = '';
  const own = owned();
  const eq = equipped();
  for (const s of SKINS) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.skin = s.id;
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = `radial-gradient(circle at 50% 35%, #fff3 0, transparent 40%), linear-gradient(160deg, ${s.color}, #111)`;
    const name = document.createElement('b');
    name.textContent = s.name;
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = s.price ? `$${s.price}` : 'Free';
    const btn = document.createElement('button');
    btn.className = 'btn small' + (eq === s.id ? ' primary' : '');
    const isOwned = own.includes(s.id);
    btn.textContent = eq === s.id ? 'Equipped' : isOwned ? 'Equip' : `Buy $${s.price} (Demo: no charge)`;
    btn.onclick = () => {
      if (!isOwned) {
        setOwned([...own, s.id]);
        toast(`${s.name} is yours (demo, no charge).`);
      } else {
        try {
          localStorage.setItem('throwhands.skin', s.id);
          localStorage.setItem('throwhands.color', s.color);
        } catch {}
        toast(`${s.name} equipped. It shows up in your next fight.`);
      }
      render();
    };
    card.append(sw, name, price, btn);
    box.appendChild(card);
  }
  const dc = $('data-card');
  dc.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = motionConsent()
    ? 'You are sharing anonymized motion data (body landmark coordinates only, never video). Thank you!'
    : 'Motion data sharing is off.';
  const b = document.createElement('button');
  b.className = 'btn small';
  b.id = 'motion-settings';
  b.textContent = 'Motion data settings';
  b.onclick = () => showConsent(() => showStore());
  dc.append(p, b);
}
