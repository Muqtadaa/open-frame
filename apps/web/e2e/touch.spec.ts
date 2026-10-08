import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { boxOf, goto } from './fixtures.js'

import { BOARD_URL } from './routes.js'

/**
 * The board under fingers (audit 2026-09-27).
 *
 * `touch-action: none` on the canvas turns the browser's own pinch off, and
 * nothing replaced it: two fingers spread started a marquee and the zoom
 * never moved. A second finger landing mid-drag took the gesture over, and a
 * system `touchcancel` — a call coming in, a palm — COMMITTED a half-finished
 * move instead of putting it back.
 *
 * Touches are sent through the DevTools protocol, one id per finger, which is
 * what Chromium turns into the pointer events the board listens to.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

interface Finger {
  readonly id: number
  readonly x: number
  readonly y: number
}

async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
  fingers: readonly Finger[],
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: fingers.map((finger) => ({ id: finger.id, x: finger.x, y: finger.y })),
  })
}

// Local rather than the shared fixture: it hands back a CDP session to send touches through.
async function board(page: Page): Promise<CDPSession> {
  await goto(page, BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  return page.context().newCDPSession(page)
}

async function placeNote(page: Page): Promise<{ x: number; y: number }> {
  await page.getByTestId('tool-sticky').tap()
  await page.locator('[data-testid="canvas"]').tap({ position: { x: 200, y: 300 } })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  const note = page.locator('[data-object-type="sticky"]')
  await expect(note).toHaveCount(1)
  const box = await boxOf(note)
  return { x: box.x, y: box.y }
}

test('two fingers spread zoom the board about them', async ({ page }) => {
  const cdp = await board(page)
  await expect(page.getByTestId('zoom-percent')).toHaveText('100%')
  await touch(cdp, 'touchStart', [
    { id: 1, x: 170, y: 420 },
    { id: 2, x: 230, y: 420 },
  ])
  for (let step = 1; step <= 6; step += 1) {
    await touch(cdp, 'touchMove', [
      { id: 1, x: 170 - step * 10, y: 420 },
      { id: 2, x: 230 + step * 10, y: 420 },
    ])
  }
  await touch(cdp, 'touchEnd', [])
  await expect(page.getByTestId('zoom-percent')).not.toHaveText('100%')
  const zoom = Number((await page.getByTestId('zoom-percent').textContent())?.replace('%', ''))
  expect(zoom).toBeGreaterThan(150)
  // Not a marquee: nothing was selected by it.
  await expect(page.getByTestId('selection-count')).toHaveCount(0)
})

test('two fingers moving together pan the board', async ({ page }) => {
  const cdp = await board(page)
  const at = await placeNote(page)
  await touch(cdp, 'touchStart', [
    { id: 1, x: 150, y: 600 },
    { id: 2, x: 250, y: 600 },
  ])
  for (let step = 1; step <= 5; step += 1) {
    await touch(cdp, 'touchMove', [
      { id: 1, x: 150 + step * 8, y: 600 - step * 8 },
      { id: 2, x: 250 + step * 8, y: 600 - step * 8 },
    ])
  }
  await touch(cdp, 'touchEnd', [])
  const moved = await boxOf(page.locator('[data-object-type="sticky"]'))
  expect(moved.x - at.x).toBeCloseTo(40, 0)
  expect(moved.y - at.y).toBeCloseTo(-40, 0)
  await expect(page.getByTestId('zoom-percent')).toHaveText('100%')
})

test('a second finger ends a drag without moving what was dragged', async ({ page }) => {
  const cdp = await board(page)
  const at = await placeNote(page)
  const grab = { id: 1, x: at.x + 30, y: at.y + 30 }
  await touch(cdp, 'touchStart', [grab])
  for (let step = 1; step <= 4; step += 1) {
    await touch(cdp, 'touchMove', [{ ...grab, x: grab.x + step * 10 }])
  }
  await touch(cdp, 'touchStart', [
    { ...grab, x: grab.x + 40 },
    { id: 2, x: 300, y: 700 },
  ])
  await touch(cdp, 'touchEnd', [])
  await boxOf(page.locator('[data-object-type="sticky"]'))
  // Put back, not moved by 40 — the board's view may have moved, but the note
  // has not moved ON the board: undo has nothing new to offer.
  await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Undo create/)
})

test('a cancelled touch puts a drag back instead of committing it', async ({ page }) => {
  const cdp = await board(page)
  const at = await placeNote(page)
  const grab = { id: 1, x: at.x + 30, y: at.y + 30 }
  await touch(cdp, 'touchStart', [grab])
  for (let step = 1; step <= 6; step += 1) {
    await touch(cdp, 'touchMove', [{ ...grab, x: grab.x + step * 10 }])
  }
  await touch(cdp, 'touchCancel', [])
  const after = await boxOf(page.locator('[data-object-type="sticky"]'))
  expect(after.x).toBeCloseTo(at.x, 0)
  expect(after.y).toBeCloseTo(at.y, 0)
  await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Undo create/)
})

/*
 * A pinch belongs to the two fingers that began it (Codex, on #11). With a
 * third finger down, lifting one of the two left two touches on the board,
 * so the pinch carried on — measuring the finger that was still there and
 * the new one against a start that held the finger that had gone, and the
 * view leapt. Lifting either of its fingers ends it, and the two that remain
 * start again from where the board is.
 */
test('lifting one of a pinch’s fingers does not throw the view', async ({ page }) => {
  const cdp = await board(page)
  const at = await placeNote(page)
  await touch(cdp, 'touchStart', [
    { id: 1, x: 150, y: 600 },
    { id: 2, x: 250, y: 600 },
  ])
  await touch(cdp, 'touchStart', [
    { id: 1, x: 150, y: 600 },
    { id: 2, x: 250, y: 600 },
    { id: 3, x: 200, y: 700 },
  ])
  // Finger 1 — one of the pair — lifts; 2 and 3 stay down. (A CDP touchEnd
  // releases the points it names.)
  await touch(cdp, 'touchEnd', [{ id: 1, x: 150, y: 600 }])
  // The two that remain move together by a single pixel.
  await touch(cdp, 'touchMove', [
    { id: 2, x: 250, y: 601 },
    { id: 3, x: 200, y: 701 },
  ])
  await touch(cdp, 'touchEnd', [])
  await expect(page.getByTestId('zoom-percent')).toHaveText('100%')
  const moved = await boxOf(page.locator('[data-object-type="sticky"]'))
  expect(Math.abs(moved.x - at.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(moved.y - at.y)).toBeLessThanOrEqual(2)
})
