import type { ObjectId, TransactionId, UserId } from '../domain/ids.js'
import type { AnyOpenFrameObject, Origin } from '../domain/object.js'
import { affectedIds, invertPatches, type Patch } from '../domain/patch.js'
import type { ObjectTypeRegistry } from '../domain/registry.js'
import type { BoardAction, Capabilities } from '../ports/capabilities.js'
import type { Clock } from '../ports/clock.js'
import type { IdGenerator } from '../ports/id-generator.js'
import type { DocumentStore, DocumentWriter } from '../store/document-store.js'
import { CommandError } from './errors.js'
import { handleCommand } from './handlers/index.js'
import { describeCommand } from './labels.js'
import { UndoStack } from './undo.js'
import type { Command, CommandContext } from './types.js'

export type DispatchResult =
  | {
      readonly ok: true
      readonly transactionId: TransactionId
      readonly label: string
      readonly origin: Origin
      readonly patches: readonly Patch[]
      readonly inverse: readonly Patch[]
      readonly affected: readonly ObjectId[]
    }
  | { readonly ok: false; readonly error: CommandError }

export interface DispatchOptions {
  readonly label?: string
  readonly origin?: Origin
  readonly actor?: UserId | null
  /** Set for changes that must not enter local history — e.g. remote edits. */
  readonly skipUndo?: boolean
}

export interface CommandDispatcherDeps {
  readonly store: DocumentStore
  readonly writer: DocumentWriter
  readonly registry: ObjectTypeRegistry
  readonly clock: Clock
  readonly ids: IdGenerator
  readonly capabilities: Capabilities
  readonly undoStack?: UndoStack
  readonly defaultActor?: UserId | null
}

/**
 * THE mutation path.
 *
 * Every persistent change in OpenFrame goes through `dispatch`, whatever
 * produced it — a toolbar click, an undo, an import, an AI response, an API
 * request, an MCP tool call. There is no second path, and adding one would
 * mean a change that skips authorization, validation, history and persistence.
 *
 * Lifecycle, in order:
 *   1. authorize    capability check (server-side once a server exists)
 *   2. validate     handlers reject before producing any patch
 *   3. mutate       pure handler turns a command into patches
 *   4. invert       inverse patches derived generically, for undo
 *   5. apply        one atomic write to the store
 *   6. record       one undo entry per dispatch, regardless of object count
 *   7. emit         subscribers persist and (later) synchronise
 */
export class CommandDispatcher {
  readonly #deps: CommandDispatcherDeps
  readonly #undoStack: UndoStack
  readonly #listeners = new Set<(result: Extract<DispatchResult, { ok: true }>) => void>()

  constructor(deps: CommandDispatcherDeps) {
    this.#deps = deps
    this.#undoStack = deps.undoStack ?? new UndoStack()
  }

  get undoStack(): UndoStack {
    return this.#undoStack
  }

  /**
   * Notified after every successful change, with the patches that caused it.
   * This is where persistence subscribes today, and where the collaboration
   * adapter will subscribe later.
   */
  subscribe(listener: (result: Extract<DispatchResult, { ok: true }>) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  dispatch(command: Command, options: DispatchOptions = {}): DispatchResult {
    return this.#run([command], options.label ?? describeCommand(command), options)
  }

  /**
   * Runs several commands as ONE undoable action.
   *
   * Used by composite operations — grouping creates a frame and reparents its
   * members, and a user undoing that expects one step, not two.
   */
  transact(
    label: string,
    commands: readonly Command[],
    options: DispatchOptions = {},
  ): DispatchResult {
    return this.#run(commands, label, options)
  }

  undo(): DispatchResult | null {
    const entry = this.#undoStack.takeUndo()
    if (entry === undefined) return null
    return this.#applyHistory(entry.inverse, entry.label, entry.origin)
  }

  redo(): DispatchResult | null {
    const entry = this.#undoStack.takeRedo()
    if (entry === undefined) return null
    return this.#applyHistory(entry.forward, entry.label, entry.origin)
  }

  #run(commands: readonly Command[], label: string, options: DispatchOptions): DispatchResult {
    const origin = options.origin ?? 'user'
    const actor = options.actor ?? this.#deps.defaultActor ?? null
    const before = this.#deps.store.getDocument()

    /*
     * Originating a change requires `edit`. APPLYING one that arrived from the
     * room requires `view`, because those are different acts by different
     * actors and the capability that governs them is not the same.
     *
     * Asking `edit` of a merge asks the wrong actor about the wrong thing: the
     * change was authorized by whoever made it and accepted by the room, and
     * the only question left for this client is whether it is allowed to SEE
     * the board. Getting that wrong made a read-only participant stop applying
     * merged changes — they sat watching a frozen board, which reads as a
     * broken app rather than as a permission. A viewer must watch; that is the
     * entire point of being one.
     *
     * Note what this is not: a bypass. Every path still passes a capability
     * check, and somebody with no access to the board at all still cannot have
     * changes merged into it. `readOnlyCapabilities` grants `view`; a denied
     * board grants neither.
     */
    const required: BoardAction = origin === 'remote' ? 'view' : 'edit'
    if (!this.#deps.capabilities.can(required, before.id)) {
      return {
        ok: false,
        error: new CommandError(
          'unauthorized',
          required === 'view'
            ? 'You do not have permission to view this board'
            : 'You do not have permission to edit this board',
        ),
      }
    }

    const context: CommandContext = {
      registry: this.#deps.registry,
      clock: this.#deps.clock,
      ids: this.#deps.ids,
      actor,
      origin,
    }

    let patches: Patch[]
    try {
      // Handlers run against a progressively updated document so that later
      // commands in a transaction see earlier ones, but nothing is written to
      // the store until every command has succeeded.
      patches = []
      let working = before
      for (const command of commands) {
        const produced = handleCommand(working, command, context)
        patches.push(...produced)
        working = { ...working, objects: applyToMap(working.objects, produced) }
      }
    } catch (error) {
      if (error instanceof CommandError) return { ok: false, error }
      throw error
    }

    const transactionId = this.#deps.ids.transactionId()

    // A command that legitimately changes nothing (a zero-distance drag) is a
    // success with no history entry — not an error, and not an undo step that
    // appears to do nothing when triggered.
    if (patches.length === 0) {
      return { ok: true, transactionId, label, origin, patches: [], inverse: [], affected: [] }
    }

    const inverse = invertPatches(before, patches)
    this.#deps.writer.applyPatches(patches)

    if (options.skipUndo !== true) {
      this.#undoStack.push({ transactionId, label, origin, forward: patches, inverse })
    }

    const result = {
      ok: true,
      transactionId,
      label,
      origin,
      patches,
      inverse,
      affected: affectedIds(patches),
    } as const
    this.#emit(result)
    return result
  }

  #applyHistory(patches: readonly Patch[], label: string, origin: Origin): DispatchResult {
    const before = this.#deps.store.getDocument()
    const inverse = invertPatches(before, patches)
    this.#deps.writer.applyPatches(patches)

    const result = {
      ok: true,
      transactionId: this.#deps.ids.transactionId(),
      label,
      origin,
      patches,
      inverse,
      affected: affectedIds(patches),
    } as const
    this.#emit(result)
    return result
  }

  #emit(result: Extract<DispatchResult, { ok: true }>): void {
    for (const listener of [...this.#listeners]) listener(result)
  }
}

/** Applies patches to a bare object map, for in-transaction sequencing. */
function applyToMap(
  objects: ReadonlyMap<ObjectId, AnyOpenFrameObject>,
  patches: readonly Patch[],
): Map<ObjectId, AnyOpenFrameObject> {
  const next = new Map(objects)
  for (const patch of patches) {
    if (patch.op === 'add') next.set(patch.id, patch.object)
    else if (patch.op === 'remove') next.delete(patch.id)
    else {
      const existing = next.get(patch.id)
      if (existing !== undefined) {
        next.set(patch.id, setPath(existing, patch.path, patch.value))
      }
    }
  }
  return next
}

function setPath<T>(target: T, path: readonly (string | number)[], value: unknown): T {
  const [head, ...rest] = path
  if (head === undefined) return target
  const key = String(head)
  const copy: Record<string, unknown> = { ...(target as Record<string, unknown>) }
  if (rest.length === 0) {
    if (value === undefined) delete copy[key]
    else copy[key] = value
  } else {
    copy[key] = setPath(copy[key], rest, value)
  }
  return copy as T
}
