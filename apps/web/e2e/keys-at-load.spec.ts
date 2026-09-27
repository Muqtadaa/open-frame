import { expect, test } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * A key pressed the moment the board appears is not lost.
 *
 * The board's keyboard listener was attached in a passive effect, which React
 * runs after the browser has painted — so for a moment the rail was on screen
 * and a key pressed at it went nowhere. The specs met it first, as a flake
 * that moved from file to file (C3 #10 and the 2026-09-27 audit); a person
 * who opens a board and presses S at once meets the same thing.
 *
 * Made deterministic here: the key is pressed in the microtask right after
 * the rail enters the DOM, which is after React's commit (and so after layout
 * effects) but before any passive effect has had a chance to run.
 */
test('a key pressed as the rail appears reaches the board', async ({ page }) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-testid="tool-sticky"]') === null) return
      observer.disconnect()
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', code: 'KeyS', bubbles: true }),
      )
    })
    observer.observe(document, { childList: true, subtree: true })
  })
  await page.goto(BOARD_URL)
  await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
})
