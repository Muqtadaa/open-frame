import type { Download, Page, Route } from '@playwright/test'
import { readFile } from 'node:fs/promises'

import { richFromPlain } from '@openframe/core'

import { buildBoard } from './boards.js'
import { CANVAS, expect, seedBoard, test, undo, viewOf } from './fixtures.js'
import { signedIn } from './signed-in.js'

/**
 * Summarising notes with AI (ADR 0022), against a stand-in for the room
 * server's `/ai/summary`: what this checks is what the board sends, shows and
 * writes — one text box beside what was summarised, citing its notes.
 */

// Opened by `seedBoard`, AFTER `signedIn` has put a session where supabase-js looks.
test.use({ board: 'none' })

const SUMMARY = {
  title: 'What we heard',
  points: [
    { text: 'Costs come too late.', refs: ['n1', 'n2'] },
    { text: 'Nobody asked about returns.', refs: [] },
  ],
}

/** A frame "Interviews" holding two notes, and two notes beside it. */
async function board(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((b) => {
      const frame = b.add('frame', { x: 420, y: 330 }, { name: richFromPlain('Interviews') })
      b.add(
        'sticky',
        { x: 260, y: 300 },
        { text: richFromPlain('Price is hidden') },
        undefined,
        frame,
      )
      b.add(
        'sticky',
        { x: 560, y: 300 },
        { text: richFromPlain('Returns are hard') },
        undefined,
        frame,
      )
      b.note('Shipping cost surprises', { x: 950, y: 250 })
      b.note('Checkout asks too much', { x: 950, y: 500 })
    }, 'Checkout study'),
  )
}

/** Answers the summary route, and keeps every request it was sent. */
async function standIn(page: Page, answer: unknown = { summary: SUMMARY, remaining: 18 }) {
  const sent: { body: unknown; authorization: string | null }[] = []
  await page.route('**/ai/summary', async (route: Route) => {
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

/** The two notes beside the frame, selected, and the sheet opened on them. */
async function summariseSelection(page: Page): Promise<void> {
  // From nothing selected: a click on a note already in a selection keeps the selection.
  await page.locator(CANVAS).click({ position: { x: 700, y: 650 } })
  await page.locator(CANVAS).click({ position: { x: 950, y: 250 } })
  await page.locator(CANVAS).click({ position: { x: 950, y: 500 }, modifiers: ['Shift'] })
  await page.locator(CANVAS).click({ position: { x: 950, y: 250 }, button: 'right' })
  await page.getByRole('menuitem', { name: 'Summarise with AI…' }).click()
  await expect(page.getByTestId('summary-review')).toHaveAttribute('data-stage', 'confirm')
}

/** The frame, picked up by its title, and the sheet opened on everything in it. */
async function summariseFrame(page: Page): Promise<void> {
  await page.getByTestId('frame-title').filter({ hasText: 'Interviews' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Summarise with AI…' }).click()
  await expect(page.getByTestId('summary-review')).toHaveAttribute('data-stage', 'confirm')
}

test(
  'summarises a selection into one text box citing its notes, in one undo step',
  { tag: '@smoke' },
  async ({ page }) => {
    await signedIn(page, [])
    await board(page)
    const sent = await standIn(page)
    await summariseSelection(page)
    await expect(page.getByTestId('summary-review')).toContainText('sent to Anthropic')

    await page.getByTestId('summary-ask').click()
    await expect(page.getByTestId('summary-review')).toHaveAttribute('data-stage', 'review')
    expect(sent).toHaveLength(1)
    expect(sent[0]?.authorization).toMatch(/^Bearer \S+/)
    expect(sent[0]?.body).toEqual({
      notes: [
        { ref: 'n1', text: 'Shipping cost surprises' },
        { ref: 'n2', text: 'Checkout asks too much' },
      ],
    })
    await expect(page.getByTestId('summary-remaining')).toHaveText('18 runs left today')
    await expect(page.getByTestId('summary-adds')).toHaveText(
      'Adds a text box citing 2 notes; nothing summarised changes',
    )

    await page.getByTestId('summary-apply').click()
    await expect(page.getByTestId('summary-review')).toHaveCount(0)
    const box = viewOf(page, 'text')
    await expect(box).toHaveCount(1)
    await expect(box).toContainText('What we heard')
    await expect(box).toContainText('Costs come too late.')
    // Selected, so the record panel says what it stands on: both notes.
    await expect(page.getByRole('list', { name: 'stands on' }).getByRole('listitem')).toHaveCount(2)
    await expect(viewOf(page, 'sticky')).toHaveCount(4)

    await undo(page)
    await expect(viewOf(page, 'text')).toHaveCount(0)
    await expect(viewOf(page, 'sticky')).toHaveCount(4)
  },
)

test('summarises a frame: everything in it and its name, and nothing beside it', async ({
  page,
}) => {
  await signedIn(page, [])
  await board(page)
  const sent = await standIn(page)
  await summariseFrame(page)
  await expect(page.getByTestId('summary-review')).toContainText('2 notes')
  await page.getByTestId('summary-ask').click()
  await expect(page.getByTestId('summary-review')).toHaveAttribute('data-stage', 'review')
  expect(sent[0]?.body).toEqual({
    notes: [
      { ref: 'n1', text: 'Price is hidden' },
      { ref: 'n2', text: 'Returns are hard' },
    ],
    frame: 'Interviews',
  })
})

test('a point edited before Apply is what the box says; Discard writes nothing', async ({
  page,
}) => {
  await signedIn(page, [])
  await board(page)
  await standIn(page)
  await summariseSelection(page)
  await page.getByTestId('summary-ask').click()
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByTestId('summary-review')).toHaveCount(0)
  await expect(viewOf(page, 'text')).toHaveCount(0)

  await summariseSelection(page)
  await page.getByTestId('summary-ask').click()
  await page.getByTestId('summary-point').first().fill('Shipping costs arrive at the till.')
  await page.getByTestId('summary-apply').click()
  await expect(viewOf(page, 'text')).toContainText('Shipping costs arrive at the till.')
  await expect(viewOf(page, 'text')).not.toContainText('Costs come too late.')
})

test('works from the keyboard: Summarise, a new title, Enter applies', async ({ page }) => {
  await signedIn(page, [])
  await board(page)
  await standIn(page)
  await summariseSelection(page)
  await expect(page.getByTestId('summary-ask')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('summary-title')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Checkout, heard')
  await page.keyboard.press('Enter')
  await expect(viewOf(page, 'text')).toContainText('Checkout, heard')
  await expect(page.locator(CANVAS)).toBeFocused()
})

test('somebody signed out is told AI needs an account, and nothing is sent', async ({ page }) => {
  await board(page)
  const sent = await standIn(page)
  await summariseSelection(page)
  await page.getByTestId('summary-ask').click()
  await expect(page.getByTestId('summary-refused')).toHaveText('AI needs an account')
  await expect(page.getByTestId('summary-sign-in')).toBeVisible()
  expect(sent).toHaveLength(0)
})

test('says why the server refused, and writes nothing', async ({ page }) => {
  await signedIn(page, [])
  await board(page)
  await page.route('**/ai/summary', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ outcome: 'declined', message: 'The AI declined' }),
    }),
  )
  await summariseSelection(page)
  await page.getByTestId('summary-ask').click()
  await expect(page.getByTestId('summary-refused')).toHaveText(
    'The AI declined to summarise these notes',
  )
  await expect(viewOf(page, 'text')).toHaveCount(0)
})

test('its citations come out with it in the Markdown export', async ({ page }) => {
  await signedIn(page, [])
  await board(page)
  await standIn(page)
  await summariseSelection(page)
  await page.getByTestId('summary-ask').click()
  await page.getByTestId('summary-apply').click()
  await expect(viewOf(page, 'text')).toHaveCount(1)

  await page.getByTestId('board-menu').click()
  const arrives = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export as Markdown' }).click()
  const download: Download = await arrives
  const text = await readFile(await download.path(), 'utf8')
  expect(text).toContain('What we heard')
  expect(text).toMatch(/Cites: .*Shipping cost surprises/)
})
