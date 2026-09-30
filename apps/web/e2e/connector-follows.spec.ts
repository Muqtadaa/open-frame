import type { Page } from '@playwright/test'

import { expect, test } from './fixtures.js'

/**
 * A line follows every change to what it joins (tracks A-6).
 *
 * A connector re-rendered only when a checksum of its ends changed, and the
 * checksum was `x + y + width`: a note made taller, turned, or moved one way
 * as far as the other left the sum — and so the line — where it was. And a
 * line joined to a GROUP never heard about the group at all when a member
 * moved, because the group's own object does not change: its bounds are its
 * members'.
 */

interface DebugWindow {
  readonly __openframe: {
    readonly runtime: {
      readonly dispatcher: {
        dispatch(command: unknown): { readonly ok: boolean; readonly error?: { message: string } }
        transact(
          label: string,
          commands: unknown[],
        ): { readonly ok: boolean; readonly error?: { message: string } }
      }
    }
  }
}

test.use({ board: 'fresh' })

/** Runs commands on the board, as one change. */
async function run(page: Page, commands: unknown[]): Promise<void> {
  await page.evaluate((list) => {
    const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.transact(
      'Test',
      list,
    )
    if (!result.ok) throw new Error(result.error?.message ?? 'refused')
  }, commands)
}

const end = (objectId: string) => ({ kind: 'object', objectId, anchor: { kind: 'auto' } })

const connector = (from: string, to: string) => ({
  kind: 'CreateObjects',
  objects: [
    {
      id: 'obj_line',
      type: 'connector',
      x: 0,
      y: 0,
      data: {
        from: end(from),
        to: end(to),
        routing: 'straight',
        points: [],
        startArrow: 'none',
        endArrow: 'arrow',
        text: [{ text: '' }],
        label: null,
      },
    },
  ],
})

const path = (page: Page) =>
  page
    .locator('[data-object-id="obj_line"]')
    .getByTestId('connector-line')
    .first()
    .getAttribute('d')

test('a line follows a note made taller, which leaves x + y + width alone', async ({ page }) => {
  await run(page, [
    {
      kind: 'CreateObjects',
      objects: [
        { id: 'obj_a', type: 'sticky', x: 100, y: 100, width: 160, height: 160 },
        { id: 'obj_b', type: 'sticky', x: 500, y: 100, width: 160, height: 160 },
      ],
    },
    connector('obj_a', 'obj_b'),
  ])
  const before = await path(page)
  expect(before).not.toBeNull()

  await run(page, [
    {
      kind: 'ResizeObjects',
      resizes: [{ id: 'obj_b', frame: { x: 500, y: 100, width: 160, height: 460, rotation: 0 } }],
    },
  ])
  await expect.poll(() => path(page)).not.toBe(before)
})

test('a line joined to a group follows a member that moves', async ({ page }) => {
  await run(page, [
    {
      kind: 'CreateObjects',
      objects: [
        { id: 'obj_a', type: 'sticky', x: 100, y: 100, width: 160, height: 160 },
        { id: 'obj_b', type: 'sticky', x: 100, y: 300, width: 160, height: 160 },
        { id: 'obj_c', type: 'sticky', x: 700, y: 200, width: 160, height: 160 },
        { id: 'obj_g', type: 'group', x: 0, y: 0 },
      ],
    },
    { kind: 'ReparentObjects', ids: ['obj_a', 'obj_b'], parentId: 'obj_g' },
    connector('obj_g', 'obj_c'),
  ])
  const before = await path(page)
  expect(before).not.toBeNull()

  await run(page, [{ kind: 'MoveObjects', moves: [{ id: 'obj_b', dx: 0, dy: 400 }] }])
  await expect.poll(() => path(page)).not.toBe(before)
})

/*
 * An EMPTY group has no members to listen to, so a line that listened only
 * when there were some never heard the first one arrive — and stayed at the
 * empty group's bounds (Codex, on #18).
 */
test('a line joined to an empty group follows the first member put in it', async ({ page }) => {
  await run(page, [
    {
      kind: 'CreateObjects',
      objects: [
        { id: 'obj_a', type: 'sticky', x: 100, y: 500, width: 160, height: 160 },
        { id: 'obj_c', type: 'sticky', x: 700, y: 200, width: 160, height: 160 },
        { id: 'obj_g', type: 'group', x: 0, y: 0 },
      ],
    },
    connector('obj_g', 'obj_c'),
  ])
  const before = await path(page)
  expect(before).not.toBeNull()

  await run(page, [{ kind: 'ReparentObjects', ids: ['obj_a'], parentId: 'obj_g' }])
  await expect.poll(() => path(page)).not.toBe(before)
})
