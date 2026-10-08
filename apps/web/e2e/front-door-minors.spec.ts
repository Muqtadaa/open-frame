import { expect, test } from '@playwright/test'
import { goto, useClipboard } from './fixtures.js'

import { BOARD_URL, HOME_URL } from './routes.js'
import { signedIn } from './signed-in.js'

/**
 * The front door's smaller faults (C3 #9), each as it was measured.
 */
const MINUTE = 60_000

test('a time stays on one line', async ({ page }) => {
  await signedIn(page, [
    { id: 'brd_aaaaaaaaaaaaaaaa', title: 'Journey map', role: 'owner', agoMs: 9 * MINUTE },
  ])
  await goto(page, HOME_URL)
  const when = page.getByTestId('board-when').first()
  await expect(when).toHaveText('9 minutes ago')
  const box = await when.boundingBox()
  // "9 minutes ago" wrapped onto two lines at 1280, three on a phone.
  expect(box?.height ?? 99).toBeLessThan(20)
})

test('a board of your own says it is yours, not merely shared', async ({ page }) => {
  await signedIn(page, [
    { id: 'brd_aaaaaaaaaaaaaaaa', title: 'Mine', role: 'owner' },
    { id: 'brd_bbbbbbbbbbbbbbbb', title: 'Theirs', role: 'editor' },
  ])
  await goto(page, HOME_URL)
  const rows = page.getByTestId('home-boards').locator('li')
  // Every row read "shared", which told nobody anything.
  await expect(rows.filter({ hasText: 'Mine' }).getByTestId('board-tag')).toHaveText('yours')
  await expect(rows.filter({ hasText: 'Theirs' }).getByTestId('board-tag')).toHaveText(
    'shared with you',
  )
})

test('an empty list says what to do next', async ({ page }) => {
  await signedIn(page, [])
  await goto(page, HOME_URL)
  await expect(page.getByTestId('home-empty')).toContainText('No boards yet')
})

test('the door says a link needs no account', async ({ page }) => {
  await goto(page, HOME_URL)
  await expect(page.getByTestId('home')).toContainText(
    'A link somebody sends you opens without an account.',
  )
})

test('naming a workspace has a label, and a way back', async ({ page }) => {
  await signedIn(page, [])
  await goto(page, HOME_URL)
  await page.getByTestId('workspace-new').click()
  const name = page.getByLabel('Name for the new workspace')
  await expect(name).toBeFocused()
  await expect(page.getByTestId('workspace-naming').locator('label')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(name).toHaveCount(0)
  await expect(page.getByTestId('workspace-new')).toBeFocused()
})

test('an invite link can be copied, and says what it gives', async ({ page, context }) => {
  await useClipboard(context)
  await signedIn(page, [{ id: 'brd_aaaaaaaaaaaaaaaa', title: 'Mine', role: 'owner' }])
  await goto(page, HOME_URL)
  await page.getByTestId('workspace-new').click()
  await page.getByTestId('workspace-name').fill('Research')
  await page.getByTestId('workspace-create').click()
  await page.getByTestId('workspace-share').click()
  // The link makes people editors, and it used to say nothing of the kind.
  await expect(page.getByTestId('workspace-share-note')).toContainText('can edit every board')
  await page.getByTestId('workspace-copy').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('workspace=')
})

// A tip peeked out from behind every open sheet, over the sheet's own edge.
test('an open sheet hides its control’s tip', async ({ page }) => {
  await signedIn(page, [])
  await goto(page, BOARD_URL)
  const account = page.getByTestId('account')
  await account.click()
  await expect(account).toHaveAttribute('aria-expanded', 'true')
  const tip = await account.evaluate((element) => getComputedStyle(element, '::after').display)
  expect(tip).toBe('none')
})
