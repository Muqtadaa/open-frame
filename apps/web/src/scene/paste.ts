import type { AnyOpenFrameObject, BoardDocument, ObjectTypeRegistry, Point } from '@openframe/core'

import { boundsOfAll } from './resize.js'

/**
 * The top-left of what a paste puts down, which is what lands at the pointer.
 *
 * Measured by each object's own bounds rather than its frame: a connector in
 * the clipboard has a frame at world zero, and measuring from there put a
 * paste at the pointer far off (tracks A-6). A type drawn from its ends has
 * no extent of its own to contribute.
 *
 * But only by bounds the paste REPRODUCES. `CreateObjects` carries no
 * rotation, so a turned object is pasted upright, and its turned envelope
 * put a 45° square about 20px off the pointer (Codex, on #18). A turned
 * object is measured by its frame, which is what the paste creates.
 */
export function pasteOrigin(
  clipboard: readonly AnyOpenFrameObject[],
  registry: ObjectTypeRegistry,
  doc: BoardDocument,
): Point {
  const box = boundsOfAll(clipboard, (object) =>
    registry.drawnFromEnds(object)
      ? null
      : object.frame.rotation !== 0
        ? object.frame
        : registry.boundsOf(object, doc),
  )
  return box === null ? { x: 0, y: 0 } : { x: box.x, y: box.y }
}
