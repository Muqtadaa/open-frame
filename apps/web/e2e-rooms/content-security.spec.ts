import { expect, test, type Page } from '@playwright/test'

import { HOME_URL } from '../e2e/routes.js'
import { join, newRoomId } from './rooms.js'

/**
 * The deployed page's security policy, against a production build.
 *
 * `vite preview` serves the build with `vercel.json`'s own headers, so this
 * is the page as the host sends it: the policy built into `index.html`, the
 * framing and referrer headers around it. The arithmetic is unit-tested in
 * `src/app/content-security-policy.test.ts`; this is a browser honouring it
 * through the paths that would break first — the splash's inline scripts, the
 * room's socket and HTTP calls, and an image read back from the room.
 */

// `playwright.rooms.config.ts` builds and serves this origin.
test.use({ baseURL: 'http://127.0.0.1:5198' })

/** Every violation the page reports, from before its first script runs. */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { __violations: string[] }).__violations = seen
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`)
    })
  })
  return () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)
}

/** A real 2×3 PNG (`e2e/images.spec.ts`): the room sniffs it and the browser decodes it. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR42mP4zwAE/xlQKAA+' +
    '1gX7ttb52gAAAABJRU5ErkJggg==',
  'base64',
)

test('a shared board works under the deployed policy, and the policy is real', async ({
  browser,
}) => {
  const room = newRoomId()

  // The front door, as the host sends it: headers, the built-in policy, and
  // the splash's inline scripts running under it.
  const context = await browser.newContext()
  const door = await context.newPage()
  const atTheDoor = await watchViolations(door)
  const response = await door.goto(HOME_URL)
  const headers = response?.headers() ?? {}
  expect(headers['content-security-policy']).toBe("frame-ancestors 'none'")
  expect(headers['referrer-policy']).toBe('no-referrer')
  await expect(door.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
  await expect(door.getByTestId('home')).toBeVisible()
  expect(await atTheDoor()).toEqual([])
  await context.close()

  // `join` waits for the socket to report connected: the room over ws.
  const page = await join(browser, room)
  const seen = await watchViolations(page)
  await page.reload()
  await expect(page.locator('[data-testid="room-status"]')).toHaveAttribute(
    'data-status',
    'connected',
    { timeout: 20_000 },
  )

  // An image is written to the room over HTTP and drawn from it.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'dot.png',
    mimeType: 'image/png',
    buffer: PNG,
  })
  const image = page.locator('[data-object-type="image"] img')
  await expect(image).toHaveCount(1)
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(2)

  // Nothing the application does was refused, the splash's scripts included.
  expect(await seen()).toEqual([])

  // And the policy is not decorative: a script nobody hashed does not run.
  const ran = await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.__injected = true'
    document.head.append(script)
    return (window as unknown as { __injected?: boolean }).__injected === true
  })
  expect(ran).toBe(false)
  await expect.poll(seen).toContainEqual(expect.stringMatching(/^script-src-elem /))
})
