import { expect, test, type Page } from '@playwright/test'

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' })
const search = (page: Page) => palette(page).getByRole('combobox')

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('never leave your browser')
})

test('Ctrl+K opens the palette with the search box focused', async ({ page }) => {
  await page.keyboard.press('Control+k')
  await expect(palette(page)).toBeVisible()
  await expect(search(page)).toBeFocused()
  await expect(palette(page).getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
})

test('Meta+K (macOS) also toggles the palette', async ({ page }) => {
  await page.keyboard.press('Meta+k')
  await expect(palette(page)).toBeVisible()
  await page.keyboard.press('Meta+k')
  await expect(palette(page)).toBeHidden()
})

test('typing filters tools and Enter navigates to the best match', async ({ page }) => {
  await page.keyboard.press('Control+k')
  await search(page).fill('jwt')
  await expect(palette(page).getByRole('option').first()).toContainText('JWT decoder')
  await page.keyboard.press('Enter')
  await expect(palette(page)).toBeHidden()
  await expect(page).toHaveURL(/#\/jwt$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('JWT decoder')
})

test('keyword aliases match too', async ({ page }) => {
  await page.keyboard.press('Control+k')
  await search(page).fill('epoch')
  await expect(palette(page).getByRole('option').first()).toContainText('Unix timestamp converter')
})

test('arrow keys move the selection and wrap around', async ({ page }) => {
  await page.keyboard.press('Control+k')
  await search(page).fill('json')
  const options = palette(page).getByRole('option')
  const count = await options.count()
  expect(count).toBeGreaterThan(1)

  await page.keyboard.press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(search(page)).toHaveAttribute('aria-activedescendant', 'palette-opt-1')

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(options.nth(count - 1)).toHaveAttribute('aria-selected', 'true')

  const label = (await options.nth(count - 1).locator('.label').textContent())!.trim()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(label)
})

test('Escape and backdrop clicks close the palette and restore focus', async ({ page }) => {
  const trigger = page.getByTestId('open-palette')
  await trigger.click()
  await expect(palette(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette(page)).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await page.getByTestId('palette').click({ position: { x: 5, y: 5 } })
  await expect(palette(page)).toBeHidden()
})

test('shows an empty state when nothing matches', async ({ page }) => {
  await page.keyboard.press('Control+k')
  await search(page).fill('zzzzqqq')
  await expect(palette(page)).toContainText('No matches for "zzzzqqq"')
  await page.keyboard.press('Enter') // must not throw or navigate
  await expect(page).toHaveURL(/#\/$/)
})

test('actions run from the palette: switching theme', async ({ page }) => {
  const html = page.locator('html')
  const before = await html.getAttribute('data-theme')
  await page.keyboard.press('Control+k')
  await search(page).fill('theme')
  await page.keyboard.press('Enter')
  // system -> light: the effective theme becomes explicit "light"
  await expect(page.getByRole('button', { name: /Theme: light/ })).toBeVisible()
  await page.keyboard.press('Control+k')
  await search(page).fill('theme')
  await page.keyboard.press('Enter')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  expect(before).toMatch(/light|dark/)
})

test('every tool listed in the palette opens without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.keyboard.press('Control+k')
  const labels = (await palette(page).getByRole('option').locator('.label').allTextContents())
    .map((s) => s.trim())
    .filter((s) => !/^(Go to home|Switch theme|Stop remembering|Remember tool)/.test(s))
  expect(labels.length).toBeGreaterThanOrEqual(10)
  await page.keyboard.press('Escape')

  for (const label of labels) {
    await page.keyboard.press('Control+k')
    await search(page).fill(label)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label)
  }
  expect(errors).toEqual([])
})
