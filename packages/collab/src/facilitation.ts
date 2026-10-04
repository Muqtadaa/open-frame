import { readTimer, type SessionTimer } from '@openframe/core/facilitation'
import type * as Y from 'yjs'

/**
 * The state of a session ABOUT the board — its timer today, its music next —
 * shared by everyone in the room (ADR 0017).
 *
 * Not board content, and deliberately not reached through the dispatcher: it
 * is not undone, not copied, not exported and not part of `BoardDocument`. A
 * countdown somebody started is a fact about the meeting, and an undo that
 * stopped it would be taking back something that was never an edit.
 *
 * It is its OWN root map, and must stay one, for the reason the change log is:
 * the room relays and stores any root map without reading it, and an older
 * client observes `objects` and `meta` only — so it carries this along and
 * never turns it into a change to the board. `meta` would not do: an older
 * client copies every key it finds there into the document.
 *
 * Who may write it is the room's to enforce, as for everything else (ADR
 * 0016): a viewer's writes never reach the room. What was written is checked
 * here, by every reader, because any editor can write anything.
 */

export const FACILITATION = 'facilitation'
const TIMER = 'timer'

export interface Facilitation {
  /** The session timer, or `null` when nobody has set one — or what is there is not one. */
  readonly timer: SessionTimer | null
}

export function facilitationOf(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>(FACILITATION)
}

export function readFacilitation(doc: Y.Doc): Facilitation {
  return { timer: readTimer(facilitationOf(doc).get(TIMER)) }
}

/**
 * Replaces the timer whole. Two people pressing at once is settled by Yjs
 * picking one record, never by merging halves of two — a timer that was half
 * one person's pause and half another's reset would be neither.
 */
export function writeTimer(doc: Y.Doc, timer: SessionTimer): void {
  facilitationOf(doc).set(TIMER, structuredClone(timer))
}
