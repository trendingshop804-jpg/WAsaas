import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: [
    ['list'],
    ['json', { outputFile: 'scratch/playwright-results.json' }],
    ['html', { outputFolder: 'scratch/playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node dev-server.js',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
