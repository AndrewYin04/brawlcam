import { defineConfig } from '@playwright/test';

export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

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
