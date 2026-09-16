import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/site',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results/site',
  use: {
    channel: 'chromium',
    baseURL: 'http://127.0.0.1:4178/ApiSip/',
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node scripts/serve-site.mjs',
    url: 'http://127.0.0.1:4178/ApiSip/',
    reuseExistingServer: false,
  },
});
