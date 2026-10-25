import { test, expect } from '@playwright/test';
import { openPage, hooks, waitScreen, realErrors, injectCamera, launcher, TQ } from './helpers';
import { GL_ARGS } from '../../playwright.config';

// Browser matrix: WebKit (proxy for iOS Safari) and Firefox through the injected camera (no file-based fake camera there),
// and Chromium on a phone viewport in landscape and portrait.
for (const name of ['webkit', 'firefox'] as const) {
  test(`${name}: pose tracking drives the fighter and a practice round plays`, async () => {
    test.setTimeout(180_000);
    const b = await launcher(name).launch(name === 'firefox' ? { firefoxUserPrefs: { 'media.navigator.streams.fake': true, 'webgl.force-enabled': true } } : {});
    const { page, consoleErrors } = await openPage(b, `/?mode=practice&skipcal&${TQ}&botlevel=-1`, { permissions: name === 'firefox' ? [] : undefined }, (ctx) => injectCamera(ctx, 'jab_01'));
    await waitScreen(page, 'game', 120_000);
    await page.waitForFunction(() => (window as any).__brawl.lastGesture?.[0]?.present === true, null, { timeout: 90_000 });
    await page.waitForFunction(() => (window as any).__brawl.localActions.length >= 2, null, { timeout: 90_000 });
    const h = await hooks(page);
    console.log('BROWSER', name, JSON.stringify({ delegate: h.delegate, poseFps: h.poseFps, renderFps: h.renderFps, actions: h.localActions.length, hits: h.events.filter((e: any) => e.type === 'hit').length }));
    expect(realErrors(consoleErrors).filter((e) => !/WebGL|GPU|webgl/i.test(e))).toEqual([]);
    await b.close();
  });
}

for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test(`chromium mobile viewport ${vp.width}x${vp.height}: practice plays, gestures register`, async () => {
    test.setTimeout(120_000);
    const b = await launcher('chromium').launch({ args: GL_ARGS });
    const { page, consoleErrors } = await openPage(b, `/?mode=practice&skipcal&${TQ}&botlevel=-1`, { viewport: vp, isMobile: true, hasTouch: true }, (ctx) => injectCamera(ctx, 'jab_01'));
    await waitScreen(page, 'game');
    await page.waitForFunction(() => (window as any).__brawl.localActions.length >= 2, null, { timeout: 60_000 });
    expect(realErrors(consoleErrors)).toEqual([]);
    await b.close();
  });
}
