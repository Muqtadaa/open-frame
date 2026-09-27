import { expect, test } from '@playwright/test'

import { signedIn } from './signed-in.js'

/**
 * What the room chip does, by who is holding it.
 *
 * Every board is born in a room now, so the two-link chooser — the reason
 * sharing was designed the way it was — only ever appeared when moving an old
 * local board. For everything else the owner's control was the chip, which
 * silently copied the EDIT link: the wrong-link risk the chooser exists to
 * prevent had become the default (C3 #9).
 *
 * The room itself is a closed port here; the chip is present whether or not
 * the room answers, which is exactly when these choices still matter.
 */
const MINE = 'brd_aaaaaaaa11111111'
const THEIRS = 'brd_bbbbbbbb22222222'
const EDIT = 'a'.repeat(32)
const VIEW = 'b'.repeat(32)

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
})

test("the owner's chip offers both links, and the password beside them", async ({ page }) => {
  await signedIn(page, [{ id: MINE, title: 'Mine', role: 'owner' }])
  await page.goto(`/?room=${MINE}&k=${EDIT}`)
  // Mine once the account has said so; until then the chip is an editor's.
  await expect(page.getByTestId('room-status')).toHaveAttribute('aria-description', /both links/)
  await page.getByTestId('room-status').click()

  const sheet = page.getByTestId('share-links')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId('copy-edit')).toBeFocused()

  await sheet.getByTestId('copy-view').click()
  // The link's name stays: "Copied" alone did not say which.
  await expect(sheet.getByTestId('copy-view')).toContainText('Copy view link')
  await expect(sheet.getByTestId('copy-view')).toContainText('Copied')
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain(`room=${MINE}`)
  expect(copied).toContain(`k=${VIEW}`)

  // The password lives beside the links it protects.
  await expect(sheet.getByLabel('A password for this board')).toBeVisible()
  await expect(sheet.getByTestId('password-save')).toBeVisible()
  await expect(sheet.getByTestId('password-save')).not.toHaveClass(/confirm-yes|danger/)
})

test("an editor's chip copies the edit link, and says so", async ({ page }) => {
  await signedIn(page, [{ id: THEIRS, title: 'Theirs', role: 'editor' }])
  await page.goto(`/?room=${THEIRS}&k=${EDIT}`)
  const chip = page.getByTestId('room-status')
  await expect(chip).toHaveAttribute('aria-description', /copy the edit link/)
  await chip.click()
  await expect(page.getByTestId('share-links')).toHaveCount(0)
  await expect(chip).toHaveAccessibleName('Edit link copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`k=${EDIT}`)
})

test('an owner who arrived on the view link is still handed the edit link', async ({ page }) => {
  await signedIn(page, [{ id: MINE, title: 'Mine', role: 'owner' }])
  // The URL carries the VIEW key; the account knows this person owns the board.
  await page.goto(`/?room=${MINE}&k=${VIEW}`)
  await expect(page.getByTestId('room-status')).toHaveAttribute('aria-description', /both links/)
  await page.getByTestId('room-status').click()

  await page.getByTestId('share-links').getByTestId('copy-edit').click()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain(`k=${EDIT}`)
  expect(copied).not.toContain(`k=${VIEW}`)
})
