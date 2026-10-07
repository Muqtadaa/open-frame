import { expect, test } from '@playwright/test'
import { useClipboard } from './fixtures.js'

import { BOARD_URL, HOME_URL } from './routes.js'
import { signedIn } from './signed-in.js'

/**
 * Every sheet takes the keyboard when it opens, lets go of it on Escape or a
 * press elsewhere, and hands it back to what opened it.
 *
 * Measured before (C3 #9): the account sheet left focus on its chip, so "Sign
 * out" was 31 Tabs away; the sign-in and share sheets ignored Escape and any
 * press outside; a row's delete confirmation ignored Escape and dropped focus
 * to the page whichever way it was answered.
 */
test('the sign-in sheet takes the keyboard and gives it back', async ({ page }) => {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  const trigger = page.getByTestId('sign-in')

  await trigger.click()
  await expect(page.getByLabel('Email')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('account-dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await trigger.click()
  await page.getByTestId('canvas').click({ position: { x: 600, y: 400 } })
  await expect(page.getByTestId('account-dialog')).toHaveCount(0)
})

test('the account sheet takes the keyboard', async ({ page }) => {
  await signedIn(page, [])
  await page.goto(BOARD_URL)
  await page.getByTestId('account').click()
  await expect(
    page.getByTestId('account-sheet').getByRole('button', { name: 'Sign out' }),
  ).toBeFocused()
})

test('the share sheet closes on a press elsewhere', async ({ page, context }) => {
  await useClipboard(context)
  await signedIn(page, [{ id: 'brd_aaaaaaaa11111111', title: 'Mine', role: 'owner' }])
  await page.goto(`/?room=brd_aaaaaaaa11111111&k=${'a'.repeat(32)}`)
  // Mine once the account has said so; until then the chip is an editor's.
  await expect(page.getByTestId('share-board')).toHaveAttribute('aria-description', /Both links/)
  await page.getByTestId('share-board').click()
  await expect(page.getByTestId('share-links')).toBeVisible()
  await page.getByTestId('canvas').click({ position: { x: 600, y: 500 } })
  await expect(page.getByTestId('share-links')).toHaveCount(0)
})

test('a delete confirmation takes the keyboard, and Escape keeps the board', async ({ page }) => {
  await signedIn(page, [{ id: 'brd_aaaaaaaa11111111', title: 'Mine', role: 'owner' }])
  await page.goto(HOME_URL)
  const row = page.getByTestId('home-boards').locator('li').first()
  const remove = row.getByTestId('delete-board')
  await remove.focus()
  await page.keyboard.press('Enter')
  // The safe answer has the keyboard, not the page.
  await expect(row.getByTestId('confirm-no')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(row.getByTestId('confirm-remove')).toHaveCount(0)
  await expect(row.getByTestId('delete-board')).toBeFocused()

  await row.getByTestId('delete-board').focus()
  await page.keyboard.press('Enter')
  await row.getByTestId('confirm-no').click()
  await expect(row.getByTestId('delete-board')).toBeFocused()
})

/*
 * The form says what is wrong in its own words, tied to the field it is about.
 * A malformed email used to raise the browser's own bubble, the one thing on
 * the page in a different register, and an error nothing pointed at.
 */
test('the sign-in form says what is wrong, beside the field', async ({ page }) => {
  await page.goto(HOME_URL)
  const email = page.getByLabel('Email')
  await email.fill('not-an-email')
  await page.getByLabel('Password').fill('secret12')
  await page.getByRole('button', { name: 'Sign in' }).click()
  const problem = page.getByRole('alert')
  await expect(problem).toContainText('email address')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  const described = await email.getAttribute('aria-describedby')
  expect(described).not.toBeNull()
  await expect(page.locator(`[id="${described ?? ''}"]`)).toContainText('email address')
  await expect(email).toBeFocused()
})

test('the sign-up name says who sees it, and keeps saying so', async ({ page }) => {
  await page.goto(HOME_URL)
  await page.getByRole('button', { name: 'Create an account' }).click()
  const name = page.getByLabel('Name')
  await name.fill('Sam')
  await expect(page.getByText('Shown on your cursor')).toBeVisible()
})

/*
 * The front door's account chip signed you out on a single press, the same
 * fault already fixed on the board's chip (and DESIGN.md: "never signs you out
 * on the press"). It opens the same account sheet now.
 */
test('the front door account chip opens the account, it does not sign out', async ({ page }) => {
  await signedIn(page, [])
  await page.goto(HOME_URL)
  const chip = page.getByTestId('home-account')
  await chip.click()
  const sheet = page.getByTestId('account-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Sign out' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(chip).toBeFocused()
  // An apparatus chip, not an outlined one.
  await expect(chip).toHaveCSS('border-top-style', 'none')
})
