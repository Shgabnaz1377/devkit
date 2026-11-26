// Renders the PWA PNG icons from public/favicon.svg with headless Chromium.
// Run after changing the logo:  node scripts/generate-icons.mjs
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const svg = await readFile(`${root}public/favicon.svg`, 'utf8')
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

// Maskable icons are cropped to a circle by some launchers, so the glyph must
// sit inside the central 80% "safe zone" on a full-bleed background.
const targets = [
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'maskable-512x512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon-180x180.png', size: 180, maskable: true },
]

const browser = await chromium.launch()
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size } })
    const inner = t.maskable ? Math.round(t.size * 0.72) : t.size
    await page.setContent(
      `<body style="margin:0;display:grid;place-items:center;width:${t.size}px;height:${t.size}px;background:${t.maskable ? '#4f46e5' : 'transparent'}">
         <img src="${dataUrl}" width="${inner}" height="${inner}">
       </body>`,
    )
    await page.locator('img').evaluate((img) => img.decode())
    await page.screenshot({ path: `${root}public/${t.file}`, omitBackground: !t.maskable })
    await page.close()
    console.log(`wrote public/${t.file}`)
  }
} finally {
  await browser.close()
}
