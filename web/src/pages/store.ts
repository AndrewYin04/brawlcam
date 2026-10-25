// Store: skins, auras, season pass (mock purchases), and the motion-data consent setting.
// Skin tiles show pre-rendered images of the game's fighter in each skin (scripts/render-skins.ts); hovering or
// tapping a tile plays its turntable and shows it big in the fitting room. No live 3D on this page.
import { show, toast } from '../main';
import { showConsent, motionConsent } from './consent';
import { SKINS, skinImage, skinSpin, type Skin } from './skins';

export { SKINS };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

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

const skinById = (id: string): Skin => SKINS.find((s) => s.id === id) ?? SKINS[0];
const touchOnly = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;

export function showStore() {
  const page = $('page');
  page.innerHTML = `
    <h2>🛒 Store</h2>
    <p class="muted">Skins change your fighter's shorts, gloves and aura. <b>Demo: no charge</b>. Purchases here are simulated.</p>
    <div class="card" style="margin-bottom:12px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;background:linear-gradient(135deg,rgba(255,61,110,.18),rgba(255,197,61,.12))">
      <div style="font-size:40px">🎟️</div>
      <div style="flex:1;min-width:200px"><b>Season 1 Pass: $5/month</b><div class="muted">All season skins, a Forge credit every week, ranked play badges, and seasonal auras.</div></div>
      <button class="btn primary" id="buy-pass">Get pass (Demo: no charge)</button>
    </div>
    <div class="card skin-stage" id="skin-stage">
      <img id="stage-img" alt="" width="320" height="400" />
      <div style="flex:1;min-width:0">
        <div class="kicker">Fitting room</div>
        <div class="skin-name" id="stage-name"></div>
        <div id="stage-status" class="price"></div>
        <div class="muted" style="margin-top:6px;font-size:13px">${touchOnly() ? 'Tap' : 'Hover'} a skin to try it on.</div>
      </div>
    </div>
    <div class="cards skin-grid" id="skins"></div>
    <h3 style="margin-top:18px">Your data</h3>
    <div class="card" id="data-card"></div>
    <div class="row"><button class="btn ghost" data-action="menu">Back</button></div>`;
  show('page');
  render();
  $('skins').addEventListener('mouseleave', () => preview(equipped()));
  $('buy-pass').onclick = () => {
    setOwned([...owned(), ...SKINS.map((s) => s.id)]);
    try {
      localStorage.setItem('throwhands.pass', '1');
    } catch {}
    toast('Season pass active (demo, no charge). All skins unlocked!');
    render();
  };
}

/** Fitting room: the big turntable of `id`. */
function preview(id: string) {
  const s = skinById(id);
  const stage = $('skin-stage');
  if (!stage) return;
  stage.style.setProperty('--skin', s.color);
  const img = $<HTMLImageElement>('stage-img');
  if (img.dataset.skin !== s.id) {
    img.dataset.skin = s.id;
    img.src = skinSpin(s.id);
    img.alt = `${s.name}: the fighter turning in this skin`;
  }
  $('stage-name').textContent = s.name;
  $('stage-status').textContent = equipped() === s.id ? '✓ Equipped' : owned().includes(s.id) ? 'Owned' : s.price ? `$${s.price}` : 'Free';
}

/** Tile image: the turntable while hovered or tapped, the still otherwise. */
function spinTile(card: HTMLElement | null, on: boolean) {
  const img = card?.querySelector<HTMLImageElement>('.skin-art');
  if (!card || !img) return;
  const id = card.dataset.skin!;
  const src = on ? skinSpin(id) : skinImage(id);
  if (!img.src.endsWith(src)) img.src = src;
  card.classList.toggle('spinning', on);
}

function render() {
  const box = $('skins');
  box.innerHTML = '';
  const own = owned();
  const eq = equipped();
  for (const s of SKINS) {
    const card = document.createElement('div');
    card.className = 'card' + (eq === s.id ? ' equipped' : '');
    card.dataset.skin = s.id;
    card.style.setProperty('--skin', s.color);
    const art = document.createElement('img');
    art.className = 'skin-art';
    art.src = skinImage(s.id);
    art.alt = `Fighter wearing ${s.name}`;
    art.width = 400;
    art.height = 500;
    art.loading = 'lazy';
    art.decoding = 'async';
    card.addEventListener('mouseenter', () => {
      if (touchOnly()) return; // a tap also fires mouseenter; the click handler toggles instead
      spinTile(card, true);
      preview(s.id);
    });
    card.addEventListener('mouseleave', () => !touchOnly() && spinTile(card, false));
    // Tap (touch screens): toggle this tile's turntable and show it in the fitting room.
    art.addEventListener('click', () => {
      const on = touchOnly() ? !card.classList.contains('spinning') : true;
      box.querySelectorAll<HTMLElement>('.card.spinning').forEach((c) => c !== card && spinTile(c, false));
      spinTile(card, on);
      preview(s.id);
    });
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
      preview(s.id);
    };
    if (eq === s.id) {
      const badge = document.createElement('div');
      badge.className = 'skin-badge';
      badge.textContent = '✓ EQUIPPED';
      card.append(badge);
    }
    card.append(art, name, price, btn);
    box.appendChild(card);
  }
  preview(eq);
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
