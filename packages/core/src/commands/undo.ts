import type { TransactionId } from '../domain/ids.js'
import type { Origin } from '../domain/object.js'
import type { Patch } from '../domain/patch.js'

/**
 * One undoable step. Corresponds to one logical user action, not one object
 * and not one input event.
 */
export interface UndoEntry {
  readonly transactionId: TransactionId
  readonly label: string
  readonly origin: Origin
  readonly forward: readonly Patch[]
  readonly inverse: readonly Patch[]
}

export const DEFAULT_UNDO_LIMIT = 200

/**
 * A local, linear undo history over inverse patches.
 *
 * This is deliberately the SIMPLE version. It is correct for a single editor,
 * and it is not what multiplayer undo will use: once collaboration lands, Yjs's
 * UndoManager takes over and scopes history by transaction origin, so that
 * undo reverts your own changes rather than whatever happened most recently.
 *
 * The reason that swap is an adapter change rather than a redesign is that
 * `origin` is already recorded on every entry, and every command already
 * produces patches rather than mutating the document in place.
 */
export class UndoStack {
  readonly #undo: UndoEntry[] = []
  readonly #redo: UndoEntry[] = []
  readonly #limit: number
  readonly #listeners = new Set<() => void>()

  constructor(limit: number = DEFAULT_UNDO_LIMIT) {
    this.#limit = limit
  }

  /** Records a new action. Any redo history is discarded, as users expect. */
  push(entry: UndoEntry): void {
    this.#undo.push(entry)
    if (this.#undo.length > this.#limit) this.#undo.shift()
    this.#redo.length = 0
    this.#notify()
  }

  takeUndo(): UndoEntry | undefined {
    const entry = this.#undo.pop()
    if (entry !== undefined) {
      this.#redo.push(entry)
      this.#notify()
    }
    return entry
  }

  takeRedo(): UndoEntry | undefined {
    const entry = this.#redo.pop()
    if (entry !== undefined) {
      this.#undo.push(entry)
      this.#notify()
    }
    return entry
  }

  get canUndo(): boolean {
    return this.#undo.length > 0
  }

  get canRedo(): boolean {
    return this.#redo.length > 0
  }

  get undoLabel(): string | null {
    return this.#undo[this.#undo.length - 1]?.label ?? null
  }

  get redoLabel(): string | null {
    return this.#redo[this.#redo.length - 1]?.label ?? null
  }

  get depth(): number {
    return this.#undo.length
  }

  clear(): void {
    this.#undo.length = 0
    this.#redo.length = 0
    this.#notify()
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) listener()
  }
}
