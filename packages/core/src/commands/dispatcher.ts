import type { BoardDocument } from '../domain/document.js'
import type { ObjectId, TransactionId, UserId } from '../domain/ids.js'
import type { AnyOpenFrameObject, Origin } from '../domain/object.js'
import { affectedIds, applyPatches, invertPatches, type Patch } from '../domain/patch.js'
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
    if (!this.#undoStack.canUndo) return null
    const refused = this.#refuseHistory()
    if (refused !== null) return refused
    const entry = this.#undoStack.takeUndo()
    if (entry === undefined) return null
    return this.#applyHistory(entry.inverse, entry.label, entry.origin, {
      left: entry.forward,
      locked: entry.locked?.after,
    })
  }

  redo(): DispatchResult | null {
    if (!this.#undoStack.canRedo) return null
    const refused = this.#refuseHistory()
    if (refused !== null) return refused
    const entry = this.#undoStack.takeRedo()
    if (entry === undefined) return null
    return this.#applyHistory(entry.forward, entry.label, entry.origin, {
      left: entry.inverse,
      locked: entry.locked?.before,
    })
  }

  /*
   * Undo ORIGINATES a change, so it asks what any other change asks: may this
   * person edit? A role narrowed to viewer since the step was recorded must
   * not be able to reach back past the narrowing. Checked BEFORE the step is
   * taken, so it is still there if editing is allowed again.
   */
  #refuseHistory(): Extract<DispatchResult, { ok: false }> | null {
    if (this.#deps.capabilities.can('edit', this.#deps.store.getDocument().id)) return null
    return {
      ok: false,
      error: new CommandError('unauthorized', 'You do not have permission to edit this board'),
    }
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
        // Through `applyPatches` for meta, which the objects map cannot carry:
        // a later command in the same transaction must see the new title.
        working = produced.some((patch) => patch.op === 'meta')
          ? applyPatches(working, produced)
          : { ...working, objects: applyToMap(working.objects, produced) }
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
      const affected = affectedIds(patches)
      const after = this.#deps.store.getDocument()
      this.#undoStack.push({
        transactionId,
        label,
        origin,
        forward: patches,
        inverse,
        locked: { before: lockedAmong(before, affected), after: lockedAmong(after, affected) },
      })
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

  /*
   * History is replayed against the board AS IT IS NOW, which is not the
   * board it was recorded on once anybody else can change it — another
   * person, or an agent. Replayed blind, a step that touched an object since
   * deleted threw out of the keyboard handler, and one that touched an object
   * since locked walked straight past the lock (tracks A-1).
   *
   * So each patch is checked against the board as the replay reaches it, and
   * the ones that no longer apply are left out: what somebody else did since
   * wins. A step with nothing left is consumed and reported, not thrown.
   */
  #applyHistory(
    patches: readonly Patch[],
    label: string,
    origin: Origin,
    recorded: RecordedState,
  ): DispatchResult {
    const before = this.#deps.store.getDocument()
    const applicable = stillApplicable(before, patches, recorded)
    if (applicable.length === 0) {
      return {
        ok: false,
        error: new CommandError(
          'stale-history',
          `“${label}” no longer applies: somebody has changed, deleted or locked it since`,
        ),
      }
    }
    const inverse = invertPatches(before, applicable)
    this.#deps.writer.applyPatches(applicable)

    const result = {
      ok: true,
      transactionId: this.#deps.ids.transactionId(),
      label,
      origin,
      patches: applicable,
      inverse,
      affected: affectedIds(applicable),
    } as const
    this.#emit(result)
    return result
  }

  #emit(result: Extract<DispatchResult, { ok: true }>): void {
    for (const listener of [...this.#listeners]) listener(result)
  }
}

/**
 * What the board looked like where a replay starts, as the step recorded it:
 * the patches that LEFT it there (the forward ones, for an undo), and which of
 * its objects were locked at that point.
 */
interface RecordedState {
  readonly left: readonly Patch[]
  readonly locked: ReadonlySet<ObjectId> | undefined
}

function lockedAmong(doc: BoardDocument, ids: readonly ObjectId[]): ReadonlySet<ObjectId> {
  const locked = new Set<ObjectId>()
  for (const id of ids) if (doc.objects.get(id)?.locked === true) locked.add(id)
  return locked
}

/**
 * The patches of a history step that still apply to `doc`, in order.
 *
 * Walked against a working copy, so a later patch sees what an earlier one in
 * the same step did. Left out:
 * - a change to an object that no longer exists, or a removal of one;
 * - a change to a property somebody has changed SINCE: its value is no longer
 *   the one this step left there, and replaying would put back an old value
 *   over their newer one (Codex, on #12);
 * - any change to an object locked by somebody else — except the one that
 *   changes its lock, so undoing your own Lock still unlocks. A lock the step
 *   was recorded with is not somebody else's: deleting an unlocked frame
 *   takes its locked child along, and redoing that must take it again. Rule
 *   3's lock check is the command layer's, and history is not a way round it.
 * Meta patches (the board's title) always apply.
 */
function stillApplicable(
  doc: BoardDocument,
  patches: readonly Patch[],
  recorded: RecordedState,
): Patch[] {
  // What the step left at each property it set: the LAST write wins.
  const left = new Map<string, unknown>()
  for (const patch of recorded.left) {
    if (patch.op === 'set') left.set(propertyKey(patch.id, patch.path), patch.value)
  }
  const lockedByOthers = (object: AnyOpenFrameObject): boolean =>
    object.locked && recorded.locked?.has(object.id) !== true

  const objects = new Map(doc.objects)
  const kept: Patch[] = []
  for (const patch of patches) {
    if (patch.op === 'meta') {
      kept.push(patch)
      continue
    }
    const existing = objects.get(patch.id)
    if (patch.op === 'add') {
      if (existing !== undefined && lockedByOthers(existing)) continue
      objects.set(patch.id, patch.object)
      kept.push(patch)
      continue
    }
    if (existing === undefined) continue
    if (patch.op === 'remove') {
      if (lockedByOthers(existing)) continue
      objects.delete(patch.id)
      kept.push(patch)
      continue
    }
    const changesLock = patch.path.length === 1 && patch.path[0] === 'locked'
    if (lockedByOthers(existing) && !changesLock) continue
    const key = propertyKey(patch.id, patch.path)
    if (
      left.has(key) &&
      !sameValue(getPath(doc.objects.get(patch.id), patch.path), left.get(key))
    ) {
      continue
    }
    objects.set(patch.id, setPath(existing, patch.path, patch.value))
    kept.push(patch)
  }
  return kept
}

function propertyKey(id: ObjectId, path: readonly (string | number)[]): string {
  return `${id}\u0000${path.join('\u0000')}`
}

function getPath(target: unknown, path: readonly (string | number)[]): unknown {
  let at = target
  for (const key of path) {
    if (at === null || typeof at !== 'object') return undefined
    at = (at as Record<string, unknown>)[String(key)]
  }
  return at
}

/** Structural equality, blind to key order: a value that round-tripped the CRDT keeps its meaning, not its order. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameValue(value, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left).filter((key) => left[key] !== undefined)
  const other = Object.keys(right).filter((key) => right[key] !== undefined)
  return keys.length === other.length && keys.every((key) => sameValue(left[key], right[key]))
}

/** Applies patches to a bare object map, for in-transaction sequencing. */
function applyToMap(
  objects: ReadonlyMap<ObjectId, AnyOpenFrameObject>,
  patches: readonly Patch[],
): Map<ObjectId, AnyOpenFrameObject> {
  const next = new Map(objects)
  for (const patch of patches) {
    // A meta patch changes the document, not its objects: nothing to sequence
    // here, and later commands in the same transaction see it through `meta`.
    if (patch.op === 'meta') continue
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
