import type { BoardDocument } from '../domain/document.js'
import type { ObjectId } from '../domain/ids.js'
import type { AnyOpenFrameObject } from '../domain/object.js'
import { affectedIds, applyPatches, isStructural, type Patch } from '../domain/patch.js'

/**
 * The READ interface. This is what the UI, the renderer and hit testing hold.
 *
 * Note what is absent: any way to change anything. Mutation lives on a separate
 * `DocumentWriter` handle that only the command dispatcher is given, at the
 * composition root. "The UI must not mutate the document directly" is therefore
 * a fact about the types rather than a rule someone has to remember.
 */
export interface DocumentStore {
  getDocument(): BoardDocument
  getObject(id: ObjectId): AnyOpenFrameObject | undefined
  /** Increments on every change. The snapshot value for whole-document subscribers. */
  getVersion(): number
  /** Fires when THIS object changes. The key to not re-rendering 5,000 objects. */
  subscribeToObject(id: ObjectId, listener: () => void): () => void
  /** Fires when objects are added or removed, not when one is merely edited. */
  subscribeToStructure(listener: () => void): () => void
  /** Fires on every change. For coarse consumers such as autosave. */
  subscribeToDocument(listener: () => void): () => void
}

/** The WRITE handle. Held only by the command dispatcher. */
export interface DocumentWriter {
  applyPatches(patches: readonly Patch[]): void
  /** Wholesale replacement, for initial load and board switching. */
  replaceDocument(document: BoardDocument): void
}

class DocumentStoreImpl implements DocumentStore, DocumentWriter {
  #document: BoardDocument
  #version = 0

  /**
   * Per-object listener channels.
   *
   * A single flat listener list would mean every mounted object re-checking
   * itself on every change — O(objects) work per pointer-up, which is exactly
   * the shape of bug that makes canvas apps feel slow at scale. Only objects
   * actually in the viewport are mounted, so this map stays small even on a
   * board with thousands of objects.
   */
  readonly #objectListeners = new Map<ObjectId, Set<() => void>>()
  readonly #structureListeners = new Set<() => void>()
  readonly #documentListeners = new Set<() => void>()

  constructor(document: BoardDocument) {
    this.#document = document
  }

  getDocument(): BoardDocument {
    return this.#document
  }

  getObject(id: ObjectId): AnyOpenFrameObject | undefined {
    return this.#document.objects.get(id)
  }

  getVersion(): number {
    return this.#version
  }

  subscribeToObject(id: ObjectId, listener: () => void): () => void {
    let listeners = this.#objectListeners.get(id)
    if (listeners === undefined) {
      listeners = new Set()
      this.#objectListeners.set(id, listeners)
    }
    listeners.add(listener)
    return () => {
      const current = this.#objectListeners.get(id)
      if (current === undefined) return
      current.delete(listener)
      if (current.size === 0) this.#objectListeners.delete(id)
    }
  }

  subscribeToStructure(listener: () => void): () => void {
    this.#structureListeners.add(listener)
    return () => this.#structureListeners.delete(listener)
  }

  subscribeToDocument(listener: () => void): () => void {
    this.#documentListeners.add(listener)
    return () => this.#documentListeners.delete(listener)
  }

  applyPatches(patches: readonly Patch[]): void {
    if (patches.length === 0) return
    this.#document = applyPatches(this.#document, patches)
    this.#version++

    for (const id of affectedIds(patches)) {
      const listeners = this.#objectListeners.get(id)
      if (listeners === undefined) continue
      for (const listener of [...listeners]) listener()
    }
    if (isStructural(patches)) {
      for (const listener of [...this.#structureListeners]) listener()
    }
    for (const listener of [...this.#documentListeners]) listener()
  }

  replaceDocument(document: BoardDocument): void {
    this.#document = document
    this.#version++
    for (const listeners of [...this.#objectListeners.values()]) {
      for (const listener of [...listeners]) listener()
    }
    for (const listener of [...this.#structureListeners]) listener()
    for (const listener of [...this.#documentListeners]) listener()
  }
}

/**
 * Creates a store and its write handle as two separate references.
 *
 * The composition root keeps `writer` and hands it to the dispatcher; `store`
 * is what everything else receives.
 */
export function createDocumentStore(document: BoardDocument): {
  store: DocumentStore
  writer: DocumentWriter
} {
  const impl = new DocumentStoreImpl(document)
  return { store: impl, writer: impl }
}
