import { chromium, webkit, firefox, type Browser, type BrowserContext, type Page, type BrowserType } from '@playwright/test';
import { GL_ARGS } from '../../playwright.config';
import path from 'path';
import fs from 'fs';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const CLIPS = path.join(ROOT, 'clips');
export const FIXTURES = path.join(ROOT, 'tests/fixtures');
export const BASE_URL = process.env.BASE_URL ?? 'https://144-202-71-213.sslip.io';
/** Query string every game page in tests uses: CPU pose delegate (SwiftShader has no real GPU) and capsule fighters. */
export const TQ = 'cpu&lowgfx&nocomment';

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
 * window.__cam controls: set(name), mask('left'|'right'|null), zoom(f), blank(bool), fail(errorName|null).
 * Clips are served from local disk through a route, never deployed.
 */
export async function injectCamera(ctx: BrowserContext, clip: string | null, failWith?: string) {
  await ctx.route((u) => u.pathname.startsWith('/__clips/'), (route) => {
    const name = path.basename(new URL(route.request().url()).pathname);
    const f = path.join(CLIPS, name);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404 });
    route.fulfill({ path: f, contentType: 'video/mp4', headers: { 'accept-ranges': 'bytes' } });
  });
  await ctx.addInitScript(
    ({ clip, failWith }) => {
      const state: any = { clip, mask: null, zoom: 1, blank: false, fail: failWith ?? null, offsetX: 0 };
      (window as any).__cam = {
        set: (c: string) => {
          state.clip = c;
          if (state.video) {
            state.video.src = `/__clips/${c}.mp4`;
            void state.video.play();
          }
        },
        mask: (m: string | null) => (state.mask = m),
        zoom: (z: number) => (state.zoom = z),
        blank: (b: boolean) => (state.blank = b),
        fail: (f: string | null) => (state.fail = f),
        state,
      };
      const md = navigator.mediaDevices ?? ((navigator as any).mediaDevices = {});
      md.enumerateDevices = async () => (state.fail === 'NotFoundError' ? [] : [{ kind: 'videoinput', deviceId: 'fake', label: 'Injected camera', groupId: 'g', toJSON() {} } as any]);
      md.getUserMedia = async () => {
        if (state.fail) throw new DOMException('Injected failure', state.fail);
        // "a|b" composes two clips side by side (two people on one camera).
        const names = String(state.clip).split('|');
        const vids = names.map((n: string) => {
          const v = document.createElement('video');
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          v.crossOrigin = 'anonymous';
          v.src = `/__clips/${n}.mp4`;
          return v;
        });
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
            g.drawImage(v, (640 - w) / 2 + state.offsetX, (480 - h) / 2, w, h);
          }
          // Raw image left = the player's right side in the mirrored preview.
          if (state.mask === 'left') g.fillRect(0, 0, 320, 480);
          if (state.mask === 'right') g.fillRect(320, 0, 320, 480);
        };
        const tick = () => {
          draw();
          setTimeout(tick, 33);
        };
        tick();
        return (c as any).captureStream(30) as MediaStream;
      };
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
