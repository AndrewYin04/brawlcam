import { chromium, webkit, firefox, type Browser, type BrowserContext, type Page, type BrowserType } from '@playwright/test';
import { GL_ARGS } from '../../playwright.config';
import path from 'path';
import fs from 'fs';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const CLIPS = path.join(ROOT, 'clips');
export const FIXTURES = path.join(ROOT, 'tests/fixtures');
export const BASE_URL = process.env.BASE_URL ?? 'https://144-202-71-213.sslip.io';
/** Query string every game page in tests uses: CPU pose delegate (SwiftShader has no real GPU) and capsule fighters. */
export const TQ = process.env.PW_GL === 'swiftshader' ? 'cpu&lowgfx&nocomment&aifixture&notut' : 'nocomment&aifixture&notut';

/** Launch a Chromium whose fake webcam plays the given clip (absolute path or name in clips/). */
export async function launchWithClip(clip?: string, extraArgs: string[] = [], opts: { fakeUi?: boolean } = {}): Promise<Browser> {
  const args = [...GL_ARGS, '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', ...extraArgs];
  if (opts.fakeUi !== false) args.push('--use-fake-ui-for-media-stream');
  if (clip) args.push(`--use-file-for-fake-video-capture=${path.isAbsolute(clip) ? clip : path.join(CLIPS, clip.endsWith('.mjpeg') ? clip : clip + '.mjpeg')}`);
  return chromium.launch({ args, channel: process.env.PW_CHANNEL || undefined });
}

export async function newCamContext(browser: Browser, opts: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ ...opts, permissions: ['camera'] });
}

/**
 * Injected camera (all browsers): getUserMedia returns a canvas stream that plays a clip.
 * window.__cam controls: set(name), mask('left'|'right'|null), zoom(f), skew(k), blank(bool), fail(errorName|null).
 * Clips are served from local disk through a route, never deployed.
 */
export async function injectCamera(ctx: BrowserContext, clip: string | null, failWith?: string) {
  await ctx.route((u) => u.pathname.startsWith('/__clips/'), (route) => {
    const name = path.basename(new URL(route.request().url()).pathname);
    const f = path.join(CLIPS, name);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404 });
    route.fulfill({ path: f, contentType: 'video/mp4', headers: { 'accept-ranges': 'bytes' } });
  });
  // The TS runner wraps named functions with a __name() helper; give the page a no-op version.
  await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
  await ctx.addInitScript(
    ({ clip, failWith }) => {
      const state: any = { clip, mask: null, zoom: 1, blank: false, fail: failWith ?? null, offsetX: 0, skew: 0 };
      (window as any).__cam = {
        set: async (c: string) => {
          state.clip = c;
          if (state.video) {
            const blob = await (await fetch(`/__clips/${c}.mp4`)).blob();
            state.video.src = URL.createObjectURL(blob);
            void state.video.play();
          }
        },
        mask: (m: string | null) => (state.mask = m),
        zoom: (z: number) => (state.zoom = z),
        // Horizontal skew pivoting at hip height: the upper body shifts sideways over the hips (a sideways lean).
        skew: (k: number) => (state.skew = k),
        // Shift the whole picture sideways (px of 640): the player stepping left/right in front of the camera.
        offset: (px: number) => (state.offsetX = px),
        blank: (b: boolean) => (state.blank = b),
        fail: (f: string | null) => (state.fail = f),
        freeze: (t: number | null) => {
          for (const v of state.vids ?? []) {
            if (t == null) void v.play();
            else {
              v.pause();
              v.currentTime = t;
            }
          }
        },
        state,
      };
      const md: any = navigator.mediaDevices ?? ((navigator as any).mediaDevices = {});
      const enumerate = async () => (state.fail === 'NotFoundError' ? [] : [{ kind: 'videoinput', deviceId: 'fake', label: 'Injected camera', groupId: 'g', toJSON() {} } as any]);
      const gum = async () => {
        if (state.fail) throw new DOMException('Injected failure', state.fail);
        // "a|b" composes two clips side by side (two people on one camera).
        const names = String(state.clip).split('|');
        // Load each clip as a Blob (WebKit's media range requests do not work through the test route).
        const vids = await Promise.all(names.map(async (n: string) => {
          const v = document.createElement('video');
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          const blob = await (await fetch(`/__clips/${n}.mp4`)).blob();
          v.src = URL.createObjectURL(blob);
          // Keep it in the DOM (invisible) so every engine keeps decoding it.
          v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none';
          (document.body ?? document.documentElement).appendChild(v);
          return v;
        }));
        const v = vids[0];
        state.video = v;
        state.vids = vids;
        await Promise.all(vids.map((x: HTMLVideoElement) => x.play().catch(() => {})));
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 480;
        const g = c.getContext('2d')!;
        const draw = () => {
          g.fillStyle = '#000';
          g.fillRect(0, 0, 640, 480);
          if (!state.blank && state.vids.length === 2) {
            // Each clip's center 320 px strip, so both people stand side by side.
            state.vids.forEach((x: HTMLVideoElement, i: number) => {
              if (x.readyState >= 2) g.drawImage(x, 160, 0, 320, 480, i * 320, 0, 320, 480);
            });
          } else if (!state.blank && v.readyState >= 2) {
            const z = state.zoom;
            const w = 640 * z, h = 480 * z;
            if (state.skew) g.setTransform(1, 0, state.skew, 1, -state.skew * 330, 0);
            g.drawImage(v, (640 - w) / 2 + state.offsetX, (480 - h) / 2, w, h);
            g.setTransform(1, 0, 0, 1, 0, 0);
          }
          // Raw image left = the player's right side in the mirrored preview.
          if (state.mask === 'left') g.fillRect(0, 0, 320, 480);
          if (state.mask === 'right') g.fillRect(320, 0, 320, 480);
          // Change one corner pixel every frame so canvas capture always emits frames (WebKit skips unchanged canvases).
          state.n = (state.n ?? 0) + 1;
          g.fillStyle = state.n % 2 ? '#010101' : '#020202';
          g.fillRect(0, 0, 1, 1);
        };
        const tick = () => {
          draw();
          setTimeout(tick, 33);
        };
        tick();
        return (c as any).captureStream(30) as MediaStream;
      };
      // Define on the prototype too: WebKit ignores plain assignment on the instance.
      for (const target of [md, (window as any).MediaDevices?.prototype].filter(Boolean)) {
        try {
          Object.defineProperty(target, 'getUserMedia', { value: gum, configurable: true, writable: true });
          Object.defineProperty(target, 'enumerateDevices', { value: enumerate, configurable: true, writable: true });
        } catch {}
      }
    },
    { clip, failWith },
  );
}

export type Hooks = {
  screen: string;
  mode: string;
  delegate: string;
  poseFps: number;
  renderFps: number;
  calibrated: boolean;
  snapshot: any;
  errors: string[];
  online: any;
  matchOver: any;
  localActions: any[];
  events: any[];
  forge: any;
  rivalry: any;
  cheers: number;
};

export const hooks = (p: Page): Promise<Hooks> => p.evaluate(() => (window as any).__brawl);
export const waitScreen = (p: Page, s: string, timeout = 60_000) => p.waitForFunction((s) => (window as any).__brawl?.screen === s, s, { timeout });

/** Console errors that are expected noise (MediaPipe logs INFO through console.error). */
export function realErrors(list: string[]) {
  return list.filter((e) => !/XNNPACK|inference_feedback_manager|landmark_projection_calculator|gl_context|GL Driver Message|OpenGL error checking/.test(e));
}

export async function openPage(browser: Browser, url: string, opts: Parameters<Browser['newContext']>[0] = {}, setup?: (ctx: BrowserContext) => Promise<void>) {
  const ctx = await browser.newContext({ permissions: ['camera'], viewport: { width: 960, height: 540 }, ...opts });
  // Test players are named "E2E ..." so they stay out of the public leaderboard (and get cleaned up).
  await ctx.addInitScript(() => {
    try {
      if (!localStorage.getItem('throwhands.nick')) localStorage.setItem('throwhands.nick', 'E2E Player');
    } catch {}
  });
  if (setup) await setup(ctx);
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE_URL + url);
  return { ctx, page, consoleErrors };
}

export function fixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

export function launcher(name: 'chromium' | 'webkit' | 'firefox'): BrowserType {
  return { chromium, webkit, firefox }[name];
}
