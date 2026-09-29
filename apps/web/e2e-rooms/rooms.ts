import { expect, type Browser, type Page } from '@playwright/test'

/**
 * Opening a shared room from a new device.
 *
 * Copied into five specs before it lived here. `live-comments` keeps its own,
 * because it signs somebody in before the room opens.
 */

/** A room nobody else in the run will pick, so specs never share a board. */
export function newRoomId(): string {
  return `brd_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
}

/**
 * A new context is a new device: no board, no CRDT, nothing stored. Returns
 * once the room reports it is connected, which is the first moment an edit
 * made here can reach anybody else.
 */
export async function join(browser: Browser, room: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`/?room=${room}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.locator('[data-testid="room-status"]')).toHaveAttribute(
    'data-status',
    'connected',
    { timeout: 20_000 },
  )
  return page
}
