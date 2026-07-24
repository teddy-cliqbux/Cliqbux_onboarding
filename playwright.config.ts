import { defineConfig } from '@playwright/test';

/**
 * Headless stress / integration suite for Cliqbux onboarding.
 *
 * Default mode is SAFE: in-memory simulation of production function behavior
 * (mirrors manageMerchantID / submitToMSP / signApplication / HubSpot bypass).
 * Set STRESS_LIVE=1 + credentials only when intentionally probing published
 * Base44 functions — never enable that for routine CI against MSPWare.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/stress-raw.json' }],
    ['./tests/reporters/stressMarkdownReporter.ts'],
  ],
  use: {
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'onboarding-stress',
      testMatch: /onboardingStress\.spec\.ts/,
    },
    {
      name: 'signing-mobile',
      testMatch: /signingMobileLayout\.spec\.ts/,
    },
  ],
});
