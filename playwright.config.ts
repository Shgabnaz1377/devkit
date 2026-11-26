import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
// Point the suite at an already running build (or a deployed URL) with E2E_BASE_URL;
// otherwise a `vite preview` server is started for the run.
const external = process.env.E2E_BASE_URL

// E2E tests run against the production build (`npm run build` first) so the
// service worker and precaching behave exactly as they will when deployed.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: external ?? `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external
    ? undefined
    : {
        command: `npx vite preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
})
