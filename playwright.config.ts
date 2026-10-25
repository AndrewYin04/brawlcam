import { defineConfig } from '@playwright/test';

// The test server has an NVIDIA GTX 1650 Ti: ANGLE over EGL gives hardware WebGL (verified via WEBGL_debug_renderer_info).
// PW_GL=swiftshader falls back to CPU rendering.
export const GL_ARGS = process.env.PW_GL === 'swiftshader'
  ? ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'];

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS ?? 2),
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://144-202-71-213.sslip.io',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
