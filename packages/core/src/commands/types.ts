import type { ObjectId, TransactionId, UserId } from '../domain/ids.js'
import type { ObjectFrame, ObjectStyle, Origin } from '../domain/object.js'
import type { ObjectTypeRegistry } from '../domain/registry.js'
import type { Clock } from '../ports/clock.js'
import type { IdGenerator } from '../ports/id-generator.js'

export interface NewObjectSpec {
  readonly type: string
  /**
   * A caller-supplied id, for when a LATER command in the same transaction has
   * to refer to this object — grouping creates a container and reparents the
   * selection into it as one action, and cannot wait to be told the id
   * afterwards.
   *
   * Omitted is the normal case and the dispatcher mints one. Supplying an id
   * that already exists is rejected: silently overwriting an object would
   * destroy it and produce an inverse patch that restores the wrong thing.
   */
  readonly id?: ObjectId
  readonly x: number
  readonly y: number
  readonly width?: number
  readonly height?: number
  readonly parentId?: ObjectId | null
  readonly data?: Record<string, unknown>
  readonly style?: ObjectStyle
}

/**
 * Every persistent change in OpenFrame, as plain data.
 *
 * Commands are JSON-serializable on purpose. That is what lets a future MCP
 * tool or HTTP endpoint construct one from a request body and hand it to the
 * same dispatcher the toolbar uses — rather than growing a second mutation path
 * that quietly skips validation, undo and authorization.
 *
 * Granularity is ONE COMMAND PER LOGICAL USER ACTION, not per object and not
 * per input event. `MoveObjects` takes an array precisely so that dragging
 * three objects is one command, one patch batch, one undo entry, one save and
 * (later) one network message.
 */
export type Command =
  | { readonly kind: 'CreateObjects'; readonly objects: readonly NewObjectSpec[] }
  | { readonly kind: 'DeleteObjects'; readonly ids: readonly ObjectId[] }
  | {
      readonly kind: 'MoveObjects'
      readonly moves: readonly { readonly id: ObjectId; readonly dx: number; readonly dy: number }[]
    }
  | {
      readonly kind: 'ResizeObjects'
      readonly resizes: readonly { readonly id: ObjectId; readonly frame: ObjectFrame }[]
    }
  | {
      readonly kind: 'UpdateObjectData'
      readonly id: ObjectId
      readonly patch: Readonly<Record<string, unknown>>
    }
  | { readonly kind: 'UpdateStyle'; readonly ids: readonly ObjectId[]; readonly style: ObjectStyle }
  | {
      readonly kind: 'RotateObjects'
      readonly rotations: readonly { readonly id: ObjectId; readonly rotation: number }[]
    }
  | {
      readonly kind: 'ReorderObjects'
      readonly ids: readonly ObjectId[]
      readonly placement: Placement
    }
  | { readonly kind: 'SetLocked'; readonly ids: readonly ObjectId[]; readonly locked: boolean }
  | { readonly kind: 'SetHidden'; readonly ids: readonly ObjectId[]; readonly hidden: boolean }
  | {
      readonly kind: 'ReparentObjects'
      readonly ids: readonly ObjectId[]
      /** `null` moves the objects back to the board root. */
      readonly parentId: ObjectId | null
    }

/** Where a reorder puts the objects within their container. */
export type Placement = 'front' | 'back' | 'forward' | 'backward'

export type CommandKind = Command['kind']

/**
 * A command plus who issued it and why.
 *
 * `origin` earns its place three times over: it is the audit trail, it lets AI
 * changes be previewed and rolled back as a group, and — when collaboration
 * arrives — it is what Yjs's UndoManager scopes on, so that remote edits never
 * land in your undo stack. Adding it later would mean revisiting every call site.
 */
export interface CommandEnvelope {
  readonly command: Command
  readonly actor: UserId | null
  readonly origin: Origin
  readonly transactionId: TransactionId
  /** Shown in the undo menu: "Move 3 objects". */
  readonly label: string
}

/** What handlers are allowed to reach. Deliberately small. */
export interface CommandContext {
  readonly registry: ObjectTypeRegistry
  readonly clock: Clock
  readonly ids: IdGenerator
  readonly actor: UserId | null
  readonly origin: Origin
}
