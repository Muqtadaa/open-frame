import { expect, test, type Page } from '@playwright/test'

import { CANVAS } from './fixtures.js'
import { BOARD_URL } from './routes.js'

/**
 * A grip is the same size at 5% as it is at 1600%.
 *
 * It was not. The selection box, its handles, the rotate grip and the
 * connection points were drawn INSIDE the board's `scale(zoom)` with every
 * length divided by the zoom — which works down to one pixel and then stops,
 * because a border cannot be painted thinner than 1px in its own coordinate
 * space. At 1600% a 9px resize handle measured 32, a 1.5px selection outline
 * was a 16px band, and the grips above a selected object ran into one another.
 *
 * No unit test can see this: it is a browser's layout, a transform and a
 * rounding rule the DOM never reports. `getComputedStyle` is no witness
 * either — it said `1px` for a border that was painting sixteen. Only the
 * rendered rectangle knows, which is why this is here rather than in vitest.
 */

type Part = 'corner' | 'rotate' | 'glyph' | 'connect' | 'edge' | 'belowRotate' | 'belowConnect'

/** Every piece of the cluster, as the browser actually lays it out. */
async function grips(page: Page): Promise<Record<Part, number | null>> {
  return page.evaluate(() => {
    const box = (selector: string): DOMRect | null =>
      document.querySelector(selector)?.getBoundingClientRect() ?? null
    const round = (n: number | undefined): number | null =>
      n === undefined ? null : Math.round(n * 10) / 10

    const corner = box('[data-testid="handle-nw"]')
    const rotate = box('[data-testid="handle-rotate"]')
    const glyph = box('.of-handle__glyph')
    const connect = box('.of-connect-point')
    const edge = box('[data-testid="edge-n"]')
    const north = box('[data-testid="handle-n"]')

    return {
      corner: round(corner?.width),
      rotate: round(rotate?.width),
      glyph: round(glyph?.width),
      connect: round(connect?.width),
      // The strip's LENGTH follows the object; only its thickness is chrome.
      edge: round(edge?.height),
      // And the cluster does not close up on itself: the rotate grip sits
      // clear of the connection point, which sits clear of the top handle.
      belowRotate: round(connect && rotate ? connect.top - rotate.bottom : undefined),
      belowConnect: round(north && connect ? north.top - connect.bottom : undefined),
    }
  })
}

/** A large shape, left selected and not being typed into. */
async function drawShape(page: Page): Promise<void> {
  await page.getByTestId('tool-shape').click()
  await page.mouse.move(340, 220)
  await page.mouse.down()
  await page.mouse.move(940, 520, { steps: 12 })
  await page.mouse.up()
  // Drawing opens the new object's text; this leaves it selected instead.
  await page.keyboard.press('Escape')
}

/**
 * Steps the zoom with `key` until the readout says `target`, one settled step
 * at a time.
 *
 * Each press waits for the readout to MOVE rather than for a fixed 40ms. Under
 * a full parallel run the fixed wait let presses overlap, and sixteen presses
 * down from 1600% once ended at 100%, half of them gone. A count of presses
 * also only ever meant "enough to reach the end", which the target now says
 * directly.
 */
async function zoomTo(page: Page, key: string, target: string): Promise<void> {
  const readout = page.getByTestId('zoom-percent')
  for (let press = 0; press < 20; press += 1) {
    const before = await readout.textContent()
    if (before === target) return
    await page.keyboard.press(key)
    await expect(readout).not.toHaveText(before ?? '')
  }
  await expect(readout).toHaveText(target)
}

test.describe('apparatus is measured in screen pixels', () => {
  test('every grip is the same size at 5% as at 1600%', async ({ page }) => {
    await page.goto(BOARD_URL)
    await expect(page.locator(CANVAS)).toBeVisible()

    /*
     * Drawn LARGE on purpose. The edge strips are skipped on an edge too short
     * to hold one, so a default-sized object has none left at 5% and the
     * comparison below would be against a different set of parts.
     */
    await drawShape(page)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()

    const atHundred = await grips(page)
    // Nothing below means anything if the cluster was not on screen.
    for (const [part, size] of Object.entries(atHundred)) {
      expect(size, `${part} was not drawn at all`).not.toBeNull()
    }
    expect(atHundred.corner).toBeGreaterThan(4)

    await zoomTo(page, 'Control+=', '1600%')
    expect(await grips(page), 'the grips grew with the board').toEqual(atHundred)

    await zoomTo(page, 'Control+-', '5%')
    /*
     * At 5% the shape is thirty pixels across, which makes it a COMPACT
     * selection: its corners stay and the rest wait for room (C3 #7). What is
     * still drawn is still the size it is at 100%.
     */
    const atFive = await grips(page)
    expect(atFive.corner, 'the corners shrank with the board').toEqual(atHundred.corner)
    expect(atFive.edge, 'a compact selection kept its strips').toBeNull()
    expect(atFive.rotate, 'a compact selection kept its rotate grip').toBeNull()
  })

  /**
   * And the band around the selection stays a line rather than becoming a
   * frame. Measured as the distance from the outline's outer edge to the
   * object's, because an outline has no box of its own to ask about.
   */
  test('the selection outline stays a hairline', async ({ page }) => {
    await page.goto(BOARD_URL)
    await expect(page.locator(CANVAS)).toBeVisible()

    await drawShape(page)

    const band = async (): Promise<number> =>
      page.evaluate(() => {
        const selection = document.querySelector('[data-testid="selection-overlay"]')
        if (selection === null) return -1
        const style = window.getComputedStyle(selection)
        /*
         * The USED width times what the element is scaled by on screen. Inside
         * the world transform those differ — which is the whole fault — and
         * the computed value alone reported 1px for a band painting sixteen.
         */
        const drawn = Number.parseFloat(style.outlineWidth)
        // How much the element is magnified by everything above it, which is
        // what `getComputedStyle` cannot tell you on its own: the declared
        // width against the rendered one.
        const declared = Number.parseFloat(style.width)
        const magnified = selection.getBoundingClientRect().width / declared
        return drawn * magnified
      })

    const atHundred = await band()
    expect(atHundred).toBeGreaterThan(0)
    await zoomTo(page, 'Control+=', '1600%')
    expect(await band(), 'the selection band thickened with the zoom').toBeCloseTo(atHundred, 1)
  })

  /*
   * A frame's edge is content drawn in the world, but it is meant as a
   * hairline at every zoom. It was held there by dividing its width by the
   * zoom — which cannot go below one pixel, so at 1600% the edge came back as
   * one WORLD pixel and painted sixteen on screen beside the selection line.
   */
  test("a frame's edge stays a hairline at 1600%", async ({ page }) => {
    await page.goto(BOARD_URL)
    await expect(page.locator(CANVAS)).toBeVisible()
    await page.getByTestId('tool-frame').click()
    await page.mouse.move(340, 220)
    await page.mouse.down()
    await page.mouse.move(940, 520, { steps: 12 })
    await page.mouse.up()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-object-type="frame"]')).toHaveCount(1)

    // The thickest edge painted anywhere in the frame, title aside.
    const thickest = async (): Promise<number> =>
      page.evaluate(() => {
        const frame = document.querySelector('[data-object-type="frame"]')
        if (frame === null) return -1
        let widest = 0
        for (const element of [frame, ...frame.querySelectorAll('*')]) {
          if (!(element instanceof HTMLElement) || element.closest('.of-frame__title')) continue
          const style = window.getComputedStyle(element)
          const declared = Number.parseFloat(style.borderTopWidth)
          if (style.borderTopStyle === 'none' || declared === 0 || element.offsetWidth === 0) {
            continue
          }
          const magnified = element.getBoundingClientRect().width / element.offsetWidth
          widest = Math.max(widest, declared * magnified)
        }
        return widest
      })

    const atHundred = await thickest()
    expect(atHundred).toBeGreaterThan(0)
    await zoomTo(page, 'Control+=', '1600%')
    expect(await thickest(), 'the frame edge thickened with the zoom').toBeLessThan(1.5)
  })
})
