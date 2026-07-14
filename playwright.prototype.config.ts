import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './prototypes/phaser-mobile-proof/tests',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'landscape-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 932, height: 430 },
      },
    },
  ],
  webServer: {
    command: 'npm run prototype:mobile -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
});
