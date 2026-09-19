import { expect, test } from '@playwright/test'

import { HOME_URL } from './routes.js'
import { PERSONAL_WORKSPACE, SHARED_WORKSPACE, signedIn } from './signed-in.js'

/**
 * Workspaces on the front door.
 *
 * Every board lives in exactly one, so the list is complete by default and
 * narrowing it is the exception — which is why "everything" is a tab rather
 * than an absence, and why it is the one selected when you arrive.
 */
const MINE = 'brd_aaaaaaaa11111111'
const OURS = 'brd_bbbbbbbb22222222'

test('narrows the board list to one workspace, and back', async ({ page }) => {
  await signedIn(page, [
    { id: MINE, title: 'My own board', role: 'owner' },
    { id: OURS, title: 'A shared board', role: 'owner', workspaceId: SHARED_WORKSPACE },
  ])
  await page.goto(HOME_URL)

  /*
   * Asserted against the LIST rather than the page: a board's title appears in
   * its row, its rename field and its label, so `getByText` finds six of them
   * and refuses to choose.
   */
  const list = page.getByTestId('home-boards')

  // Everything, by default: a filter you did not set is how a board goes
  // missing.
  await expect(page.getByTestId('workspace-all')).toHaveAttribute('aria-pressed', 'true')
  await expect(list).toContainText('My own board')
  await expect(list).toContainText('A shared board')

  await page.getByTestId(`workspace-${PERSONAL_WORKSPACE}`).click()
  await expect(list).toContainText('My own board')
  await expect(list).not.toContainText('A shared board')

  await page.getByTestId('workspace-all').click()
  await expect(list).toContainText('A shared board')
})

test('makes a workspace and shows it straight away', async ({ page }) => {
  await signedIn(page, [{ id: MINE, title: 'My own board', role: 'owner' }])
  await page.goto(HOME_URL)

  await page.getByTestId('workspace-new').click()
  await page.getByTestId('workspace-name').fill('Research')
  await page.getByTestId('workspace-create').click()

  // Made, listed, and selected — a workspace you have just named is the one
  // you meant to be looking at.
  const made = page.getByTestId(`workspace-${SHARED_WORKSPACE}`)
  await expect(made).toContainText('Research')
  await expect(made).toHaveAttribute('aria-pressed', 'true')
})

/**
 * The link is what lets somebody in, so it has to carry the key. A link with
 * only the workspace id opens a front door that says nothing happened.
 */
test('offers an invite link for a shared workspace, and never for a personal one', async ({
  page,
}) => {
  await signedIn(page, [
    { id: OURS, title: 'A shared board', role: 'owner', workspaceId: SHARED_WORKSPACE },
  ])
  await page.goto(HOME_URL)

  // A personal workspace is nobody else's business, so it is not shareable.
  await page.getByTestId(`workspace-${PERSONAL_WORKSPACE}`).click()
  await expect(page.getByTestId('workspace-share')).toHaveCount(0)

  await page.getByTestId('workspace-new').click()
  await page.getByTestId('workspace-name').fill('Research')
  await page.getByTestId('workspace-create').click()

  await page.getByTestId('workspace-share').click()
  const link = page.getByTestId('workspace-invite')
  await expect(link).toHaveValue(new RegExp(`workspace=${SHARED_WORKSPACE}`))
  await expect(link).toHaveValue(/wk=[0-9a-f]{32}/)
})

/**
 * Following an invitation while signed out must not SPEND it.
 *
 * Joining takes an account. Redeeming on arrival would burn the link for
 * somebody who has not signed in yet and leave them looking at an empty front
 * door with no way back to it.
 */
test('keeps an invitation until there is an account to accept it', async ({ page }) => {
  await signedIn(page, [], 'Nobody')
  // Signed out: the stub's session key is what makes the app believe
  // otherwise, so this test clears it before anything loads.
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.localStorage.setItem('openframe:splash-hold', 'off')
  })

  await page.goto(`/?workspace=${SHARED_WORKSPACE}&wk=${'e'.repeat(32)}`)

  /*
   * Waited for the board list to SETTLE before asserting, or this test proves
   * nothing. The notice once sat inside the boards section, which does not
   * render at all for somebody signed out with no boards — and the assertion
   * beat the list to the finish and passed anyway. It failed only under load,
   * in the full suite, which is the worst way to find out.
   */
  await expect(page.getByTestId('home-boards')).toHaveCount(0)
  await expect(page.getByTestId('home-start')).toHaveCount(0)

  await expect(page.getByTestId('workspace-invited-signedout')).toBeVisible()
  // And the key is still in the address bar, waiting to be spent.
  expect(page.url()).toContain('wk=')
})

test('accepts an invitation once signed in, and takes the key out of the URL', async ({ page }) => {
  await signedIn(page, [{ id: MINE, title: 'My own board', role: 'owner' }])
  await page.goto(`/?workspace=${SHARED_WORKSPACE}&wk=${'e'.repeat(32)}`)

  await expect(page.getByTestId('workspace-invited')).toContainText('editor')

  /*
   * The key is the credential. One left in the address bar is one a browser
   * somebody else picks up can re-offer, so it goes the moment it is spent.
   */
  await expect.poll(() => page.url()).not.toContain('wk=')
})
