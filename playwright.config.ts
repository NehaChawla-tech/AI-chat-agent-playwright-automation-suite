import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Default (30s) is too tight against a live LLM backend: recon measured ~3-4.5s typical
     response time, but a real run hit a >20s tail-latency response from the live service.
     60s (raised from an initial 45s): beforeEach's own waits (cookie banner + waiting out
     the auto-greeting + confirming its bubble landed) can alone approach 45s in a legitimate
     worst case under heavy parallel cross-browser load, which would leave the test body no
     real headroom to also wait out a slow response. This is a ceiling for genuinely hung
     requests, not a target duration -- real runs finish in 10-30s. */
  timeout: 60_000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  /* Forced to 1 locally (down from Playwright's default, which picks a worker count off
     CPU cores -- 4 on this machine). Evidence from actually running the full 3-browser
     matrix at each level:
       - workers: 4 (default) -- repeated contention failures (test 2's beforeEach timing
         out on the cookie banner, test 5's toBeDisabled not firing in time).
       - workers: 2 -- durations improved substantially (most tests 6-17s vs. 20-45s at
         4), but still produced one WebKit cookie-banner failure across two full runs.
       - workers: 1 -- the level that actually gets a deterministic local signal.
     This isn't a real behavioural difference between browsers: each one passes 8/8
     reliably in isolation, and this machine is also carrying normal desktop Chrome/Edge
     load alongside the test run, not just Playwright's own browsers. This is a local
     dev-machine concession, not a fix to the app or the tests -- the assertions and
     timeouts are already evidence-based and are not being loosened to compensate. In a
     real CI pipeline, each browser would run as its own job (one browser per machine, not
     three sharing one), so this constraint doesn't apply there -- but CI stays at 1 too,
     for the original, unrelated reason (no shared-machine contention there to avoid, but
     still no reason to parallelize within a single job). */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'https://ask.permission.ai',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
