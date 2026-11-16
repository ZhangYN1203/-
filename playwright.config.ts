import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
export default defineConfig({
  testDir: './tests/e2e', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1500, height: 1000 }, launchOptions: { executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] } },
  webServer: { command: 'npm run dev:web -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
})
