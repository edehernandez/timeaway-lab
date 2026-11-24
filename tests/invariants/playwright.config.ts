// Purpose: the ledger runner's configuration — Playwright Test over tests/invariants/*.spec.ts, one worker, Chromium, the product reached only at VID_PRODUCT_URL (D-030).
// Provenance: hand-authored (test-author pass, slice 0, code skeleton harness pass).
//
// docker-compose.test.yml runs:
//   playwright test -c tests/invariants/playwright.config.ts --reporter=line,junit --timeout=<case limit>
// with the junit file going to /vid-results/pending.xml. The tree is mounted read-only at /app, so every
// file Playwright writes (results, traces, .last-run.json) goes under /tmp.
//
// A case id in the receipt is the test's title (no describe blocks are used in this ledger), and every
// title names the row id it pays.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  workers: 1,
  retries: 0,
  fullyParallel: false,
  forbidOnly: true,
  outputDir: '/tmp/vid-playwright/output',
  use: {
    // harness.ts reads the same variable and refuses to run without it (a setup failure, never a row's).
    baseURL: process.env.VID_PRODUCT_URL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], baseURL: process.env.VID_PRODUCT_URL },
    },
  ],
});
