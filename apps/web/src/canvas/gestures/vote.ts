import type { GestureHandler } from './types.js'

/** Further than this, in screen pixels, and the press was a drag, not a vote. */
const SLOP = 6

/**
 * A dot, pressed onto an object and cast when the pointer comes back up.
 *
 * On release rather than on the press, for the same reason a button works
 * that way: a press that turns into a drag, or the first finger of a pinch
 * (which abandons the gesture), was never a vote.
 */
export const vote: GestureHandler = {
  move: (_ctx, active, event) => {
    if (
      Math.hypot(event.clientX - active.startClient.x, event.clientY - active.startClient.y) > SLOP
    ) {
      active.moved = true
    }
  },
  commit: (ctx, active) => {
    if (active.moved || active.vote === undefined) return
    ctx.commands.vote(active.vote.on, active.vote.by, active.vote.remove)
  },
}
