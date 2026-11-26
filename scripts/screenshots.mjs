// Captures the README screenshots from a running build.
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   node scripts/screenshots.mjs [baseUrl]
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const base = (process.argv[2] ?? 'http://localhost:4173/').replace(/\/?$/, '/')
const out = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))
await mkdir(out, { recursive: true })

const browser = await chromium.launch()

async function shot(name, route, { theme = 'light', width = 1280, height = 820, before } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme })
  // Start from a clean slate with the chosen theme so screenshots are reproducible.
  await context.addInitScript((t) => {
    localStorage.clear()
    localStorage.setItem('devkit:settings', JSON.stringify({ theme: t, remember: true }))
  }, theme)
  const page = await context.newPage()
  await page.goto(`${base}#${route}`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  if (before) await before(page)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}${name}.png` })
  await context.close()
  console.log(`docs/screenshots/${name}.png`)
}

await shot('home', '/')
await shot('palette', '/', {
  before: async (page) => {
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox').fill('js')
  },
})
await shot('jwt', '/jwt', {
  height: 900,
  before: async (page) => {
    await page.getByLabel('Shared secret').fill('your-256-bit-secret')
    await page.getByText('Signature verified').waitFor()
  },
})
await shot('json-tree', '/json', { before: (page) => page.getByRole('button', { name: 'Tree' }).click() })
await shot('cron', '/cron', { height: 860, before: (page) => page.getByRole('button', { name: 'UTC' }).click() })
await shot('regex', '/regex', { height: 900, before: (page) => page.locator('table.matches').waitFor() })
await shot('color', '/color', { theme: 'dark', height: 860 })
await shot('text-diff', '/text-diff', { theme: 'dark', height: 860 })
await shot('mobile', '/timestamp', { width: 390, height: 844 })

await browser.close()
