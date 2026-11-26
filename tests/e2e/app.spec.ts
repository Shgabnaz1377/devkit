import { expect, test } from '@playwright/test'

test('a share link restores the tool input in a fresh browser', async ({ page, context, browser }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./#/cron')
  const expr = page.getByLabel('Cron expression')
  await expr.fill('*/5 9-17 * * MON-FRI')
  await page.getByRole('button', { name: 'Copy share link' }).click()
  await expect(page.getByRole('status').first()).toHaveText('Share link copied to clipboard')
  const url = await page.evaluate(() => navigator.clipboard.readText())
  expect(url).toMatch(/#\/cron\?s=[A-Za-z0-9_-]+$/)

  const other = await browser.newContext()
  const fresh = await other.newPage()
  await fresh.goto(url)
  await expect(fresh.getByLabel('Cron expression')).toHaveValue('*/5 9-17 * * MON-FRI')
  await expect(fresh.getByText('At every 5th minute past every hour from 9 through 17 on Monday through Friday.')).toBeVisible()
  // The payload is removed from the address bar once applied.
  await expect(fresh).toHaveURL(/#\/cron$/)
  await other.close()
})

test('share links never contain secrets', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./#/jwt')
  await page.getByLabel('Shared secret').fill('super-secret-value')
  await page.getByRole('button', { name: 'Copy share link' }).click()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  const payload = new URL(url).hash.split('s=')[1]!
  const json = Buffer.from(payload, 'base64url').toString('utf8')
  expect(json).toContain('token')
  expect(json).not.toContain('super-secret-value')
})

test('input is remembered across reloads, and forgotten when the toggle is off', async ({ page }) => {
  await page.goto('./#/encode')
  const input = page.getByRole('textbox', { name: 'Input', exact: true })
  await input.fill('remember me')
  await page.reload()
  await expect(input).toHaveValue('remember me')

  await page.getByTestId('remember-toggle').uncheck()
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('devkit:tool:')))
  expect(stored).toEqual([])
  await page.reload()
  await expect(input).not.toHaveValue('remember me')
})

test('the app keeps working offline once the service worker is installed', async ({ page, context }) => {
  await page.goto('./#/hash')
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hash generator')
  // A lazily loaded tool that was never opened online still loads from the precache.
  await page.goto('./#/color')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Color converter')
  await context.setOffline(false)
})

test('layout fits a phone screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  for (const route of ['./', './#/jwt', './#/text-diff', './#/color', './#/regex']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0)
  }
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('navigation', { name: 'Tools' })).toBeVisible()
})
