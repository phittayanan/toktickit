import { defineConfig } from '@playwright/test'

// Playwright config for Lab 2's E2E and visual-QA suites (docs/lab-02/tests.md).
// Assumes the client (5173) and server (4000) are already running locally —
// this repo has no single "start everything" script yet, so we don't try to
// spawn them here.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.CLIENT_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
})
