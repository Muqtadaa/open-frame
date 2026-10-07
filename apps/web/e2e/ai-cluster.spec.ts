import type { Page, Route } from '@playwright/test'

import { buildBoard } from './boards.js'
import { CANVAS, expect, seedBoard, test, undo, viewOf } from './fixtures.js'
import { signedIn } from './signed-in.js'

/**
 * Clustering notes with AI (ADR 0018), against a stand-in for the room
 * server's `/ai/cluster`: the model itself is the server's business, and
 * what this checks is what the board sends, shows and writes.
 */

// Opened by `seedBoard`, AFTER `signedIn` has put a session where supabase-js looks.
test.use({ board: 'none' })

const NOTES = ['Price is hidden', 'Shipping cost surprises', 'Returns are hard']

const PROPOSAL = {
  title: 'Checkout',
  clusters: [{ label: 'Cost', summary: 'Money at the till.', refs: ['n1', 'n2'] }],
  unassigned: ['n3'],
}

async function board(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((b) => {
      NOTES.forEach((text, index) => b.note(text, { x: 300 + index * 220, y: 300 }))
    }),
  )
}

/** Answers the cluster route, and keeps every request it was sent. */
async function standIn(page: Page, answer: unknown = { proposal: PROPOSAL, remaining: 19 }) {
  const sent: { body: unknown; authorization: string | null }[] = []
  await page.route('**/ai/cluster', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    sent.push({
      body: request.postDataJSON(),
      authorization: request.headers().authorization ?? null,
    })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(answer),
    })
  })
  return sent
}

async function openCluster(page: Page): Promise<void> {
  await page.locator(CANVAS).click({ position: { x: 1100, y: 600 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.locator(CANVAS).click({ position: { x: 300, y: 300 }, button: 'right' })
  await page.getByRole('menuitem', { name: 'Cluster with AI…' }).click()
  await expect(page.getByTestId('cluster-review')).toHaveAttribute('data-stage', 'confirm')
}

test(
  'sends only the notes’ text, then lays the themes out as copies, in one undo step',
  {
    tag: '@smoke',
  },
  async ({ page }) => {
    await signedIn(page, [])
    await board(page)
    const sent = await standIn(page)
    await openCluster(page)
    await expect(page.getByTestId('cluster-review')).toContainText('sent to Anthropic')

    await page.getByTestId('cluster-ask').click()
    await expect(page.getByTestId('cluster-review')).toHaveAttribute('data-stage', 'review')
    expect(sent).toHaveLength(1)
    expect(sent[0]?.authorization).toMatch(/^Bearer \S+/)
    expect(sent[0]?.body).toEqual({
      notes: NOTES.map((text, index) => ({ ref: `n${String(index + 1)}`, text })),
    })
    await expect(page.getByTestId('cluster-remaining')).toHaveText('19 runs left today')
    await expect(page.getByTestId('cluster-other')).toContainText('1 note')

    await page.getByTestId('cluster-label').fill('What it costs')
    await page.getByTestId('cluster-apply').click()
    await expect(page.getByTestId('cluster-review')).toHaveCount(0)

    // An outer frame, a theme, and Other; the three originals and three copies.
    await expect(viewOf(page, 'frame')).toHaveCount(3)
    await expect(page.getByTestId('frame-title').filter({ hasText: 'What it costs' })).toHaveCount(
      1,
    )
    await expect(viewOf(page, 'sticky')).toHaveCount(6)

    await undo(page)
    await expect(viewOf(page, 'frame')).toHaveCount(0)
    await expect(viewOf(page, 'sticky')).toHaveCount(3)
  },
)

test('discarding writes nothing, and Escape closes the panel', async ({ page }) => {
  await signedIn(page, [])
  await board(page)
  await standIn(page)
  await openCluster(page)
  await page.getByTestId('cluster-ask').click()
  await expect(page.getByTestId('cluster-review')).toHaveAttribute('data-stage', 'review')
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(viewOf(page, 'frame')).toHaveCount(0)

  await openCluster(page)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('cluster-review')).toHaveCount(0)
})

test('works from the keyboard: Cluster, a new title, Enter applies', async ({ page }) => {
  await signedIn(page, [])
  await board(page)
  await standIn(page)
  await openCluster(page)
  await expect(page.getByTestId('cluster-ask')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('cluster-title')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Checkout pains')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('frame-title').filter({ hasText: 'Checkout pains' })).toHaveCount(1)
  // The panel leaves with Apply; the keyboard goes to the board, where the new frame is.
  await expect(page.locator(CANVAS)).toBeFocused()
})

test('keeps the keyboard inside, and Escape closes it from anywhere without touching the selection', async ({
  page,
}) => {
  await signedIn(page, [])
  await board(page)
  await standIn(page)
  await openCluster(page)
  const panel = page.getByTestId('cluster-review')
  // Past its last control, Tab comes round to its first rather than leaving.
  for (let press = 0; press < 4; press++) await page.keyboard.press('Tab')
  await expect(panel.locator(':focus')).toHaveCount(1)

  // Focus somewhere else — the board — and Escape still closes the panel, and only the panel.
  await page.locator(CANVAS).focus()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.getByTestId('selection-count')).toContainText('3')
})

test('somebody signed out is told AI needs an account, and nothing is sent', async ({ page }) => {
  await board(page)
  const sent = await standIn(page)
  await openCluster(page)
  await page.getByTestId('cluster-ask').click()
  await expect(page.getByTestId('cluster-refused')).toHaveText('AI needs an account')
  expect(sent).toHaveLength(0)
})

test('says why the server refused, and writes nothing', async ({ page }) => {
  await signedIn(page, [])
  await board(page)
  await page.route('**/ai/cluster', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ outcome: 'limit', message: 'No AI runs left today' }),
    }),
  )
  await openCluster(page)
  await page.getByTestId('cluster-ask').click()
  await expect(page.getByTestId('cluster-refused')).toHaveText('No AI runs left today')
  await expect(viewOf(page, 'frame')).toHaveCount(0)
})
