import { expect, test } from '@playwright/test'
import { join, newRoomId } from './rooms.js'

/**
 * A shared board opens under its own name, on every device (reported by the
 * owner: "named boards aren't always pulling in the name when I open the
 * board, even though the name is on the dashboard").
 *
 * A browser opening a shared board for the first time has no copy of it, so
 * it starts from an empty document called "Untitled board" — and it used to
 * publish that into the room before the room had answered. The two titles
 * were concurrent, Yjs broke the tie by a random client id, and about half of
 * all first opens lost: that device showed "Untitled board" for good, and an
 * editor's renamed the board for everybody.
 */

interface DebugWindow {
  readonly __openframe: {
    readonly runtime: {
      readonly dispatcher: {
        dispatch(command: unknown): { readonly ok: boolean; readonly error?: { message: string } }
      }
    }
  }
}

test('every device opening a named board sees its name', async ({ browser }) => {
  const room = newRoomId()
  const owner = await join(browser, room)
  await owner.evaluate(() => {
    const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.dispatch({
      kind: 'SetBoardTitle',
      title: 'Pricing research',
    })
    if (!result.ok) throw new Error(result.error?.message ?? 'refused')
  })
  await expect(owner.getByTestId('board-title')).toHaveText('Pricing research')

  /*
   * Several newcomers, one after another, because the old failure was a coin
   * toss: one device alone passed about half the time with the bug present.
   */
  for (let device = 0; device < 6; device += 1) {
    const newcomer = await join(browser, room)
    await expect(newcomer.getByTestId('board-title')).toHaveText('Pricing research', {
      timeout: 20_000,
    })
    await newcomer.context().close()
  }

  // And nobody's arrival renamed the board for the one who named it.
  await expect(owner.getByTestId('board-title')).toHaveText('Pricing research')
})
