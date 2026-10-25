// Explicit, opt-in consent for sharing anonymized motion data. Off by default.
import { show } from '../main';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function motionConsent(): boolean {
  try {
    return localStorage.getItem('throwhands.motionConsent') === 'yes';
  } catch {
    return false;
  }
}

export function setMotionConsent(v: boolean) {
  try {
    localStorage.setItem('throwhands.motionConsent', v ? 'yes' : 'no');
  } catch {}
}

export function showConsent(done: () => void) {
  const page = $('page');
  page.innerHTML = `
    <h2>Share your moves to help robots learn? (optional)</h2>
    <div class="card" style="text-align:left;line-height:1.55">
      <p><b>What we would collect:</b> the 3D positions of 33 body points (like wrists, elbows, shoulders): short sequences around each move the game detects (jab, hook, block…), plus <b>continuous body-point coordinates during play</b> (15 times a second, up to 10 minutes per match).</p>
      <p><b>What we never collect:</b> video, photos, your face, your name, your nickname, or any player ID. Each match gets a random session number that is not linked to you.</p>
      <p><b>Why:</b> robotics labs need examples of real human motion to teach humanoid robots. This may be licensed to them in the future.</p>
      <p><b>Your choice:</b> this is off unless you tick the box. You can turn it off at any time in the Store, and nothing is sent while it is off.</p>
      <label style="display:flex;gap:10px;align-items:center;margin-top:10px;font-weight:600"><input type="checkbox" id="consent-box" /> I agree to share anonymized motion data as described above.</label>
    </div>
    <div class="row"><button class="btn primary" id="consent-save">Save</button><button class="btn ghost" id="consent-cancel">Cancel</button></div>`;
  show('page');
  const box = $<HTMLInputElement>('consent-box');
  box.checked = motionConsent();
  $('consent-save').onclick = () => {
    setMotionConsent(box.checked);
    done();
  };
  $('consent-cancel').onclick = () => done();
}
