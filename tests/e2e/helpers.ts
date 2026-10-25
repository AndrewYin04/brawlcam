import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { GL_ARGS } from '../../playwright.config';
import path from 'path';

export const CLIPS = path.resolve(import.meta.dirname, '../../clips');
export const BASE_URL = process.env.BASE_URL ?? 'https://144-202-71-213.sslip.io';

/** Launch a Chromium whose fake webcam plays the given clip (absolute path or name in clips/). */
export async function launchWithClip(clip?: string, extraArgs: string[] = []): Promise<Browser> {
  const args = [...GL_ARGS, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', ...extraArgs];
  if (clip) args.push(`--use-file-for-fake-video-capture=${path.isAbsolute(clip) ? clip : path.join(CLIPS, clip.endsWith('.mjpeg') ? clip : clip + '.mjpeg')}`);
  return chromium.launch({ args, channel: process.env.PW_CHANNEL || undefined });
}

export async function newCamContext(browser: Browser, opts: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...opts, permissions: ['camera'] });
  return ctx;
}
