import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'WEB_PORT=3100 VITE_API_BASE=http://localhost:3108/api npm run dev',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
