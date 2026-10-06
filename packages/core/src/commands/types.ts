import type { AssetRef } from '../domain/document.js'
import type { ObjectId, TransactionId, UserId } from '../domain/ids.js'
import type { ObjectFrame, ObjectStyle, Origin } from '../domain/object.js'
import type { Patch } from '../domain/patch.js'
import type { ObjectTypeRegistry } from '../domain/registry.js'
import type { AlignEdge, DistributeAxis } from '../geometry/arrange.js'
import type { Clock } from '../ports/clock.js'
import type { IdGenerator } from '../ports/id-generator.js'
import type { MarkAuthor } from '../types/reaction/schema.js'
import type { VoteRoundStatus, VoteScope } from '../types/vote-round/schema.js'

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
  /** Radians, as `ObjectFrame.rotation`; a copy keeps the turn of what it was copied from. Default 0. */
  readonly rotation?: number
  /** A copy of a hidden object stays hidden. Default false. */
  readonly hidden?: boolean
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
  /**
   * Renames the board.
   *
   * The only command that changes the document rather than an object, which is
   * why `Patch` has a `meta` op at all — a board's name is document state, and
   * renaming it is a persistent mutation that has to reach the one path.
   */
  | { readonly kind: 'SetBoardTitle'; readonly title: string }
  /**
   * Puts the whole board back to an earlier version (ADR 0019). `objects` is
   * the version's objects as stored — unread, since storage is a boundary.
   */
  | { readonly kind: 'RestoreBoard'; readonly objects: readonly unknown[]; readonly title: string }
  | { readonly kind: 'DeleteObjects'; readonly ids: readonly ObjectId[] }
  /**
   * Changes objects' TYPE while keeping their identity — a sticky becoming a
   * piece of evidence, evidence becoming an insight.
   *
   * `toType` is a plain string rather than a union, like `NewObjectSpec.type`:
   * the set of types is the registry's, and a union here would have to be
   * edited every time one is added.
   */
  | { readonly kind: 'ConvertObjects'; readonly ids: readonly ObjectId[]; readonly toType: string }
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
  /**
   * Wraps objects that share a parent in a new group, inside that parent.
   *
   * `id` names the group when the caller has to know it — to select it
   * afterwards — exactly as `NewObjectSpec.id` does. Omitted, one is minted.
   */
  | { readonly kind: 'GroupObjects'; readonly ids: readonly ObjectId[]; readonly id?: ObjectId }
  /**
   * Dissolves the groups among `ids`, handing their members to the group's own
   * parent. Anything in `ids` that is not a group is passed over, so a mixed
   * selection ungroups what it can.
   */
  | { readonly kind: 'UngroupObjects'; readonly ids: readonly ObjectId[] }
  /** Lines objects up on one edge of their own bounding box. */
  | { readonly kind: 'AlignObjects'; readonly ids: readonly ObjectId[]; readonly edge: AlignEdge }
  /** Evens out the gaps between objects along one axis. */
  | {
      readonly kind: 'DistributeObjects'
      readonly ids: readonly ObjectId[]
      readonly axis: DistributeAxis
    }
  /**
   * Puts down what was copied (`ClipboardContent`), offset by a delta, under
   * new ids — from this board or another, from this build or another.
   *
   * `content` is `unknown` on purpose: by the time it is pasted it has been
   * through the system clipboard, so the handler reads it the way a board is
   * read from storage and holds every object to its type's schema.
   */
  | {
      readonly kind: 'PasteObjects'
      readonly content: unknown
      readonly dx: number
      readonly dy: number
      /**
       * What each asset in the copy became on this board, by the copy's asset
       * id — the pictures a paste from another board had to upload first.
       * An asset not named here is kept as it was.
       */
      readonly assets?: Readonly<Record<string, AssetRef>>
    }
  /** Copies objects — geometry, style and data — offset by a delta, under new ids. */
  | {
      readonly kind: 'DuplicateObjects'
      readonly ids: readonly ObjectId[]
      readonly dx: number
      readonly dy: number
    }
  /**
   * Creates an object of `toType` at a point and relates it back to each of
   * `from`: evidence becoming an insight that cites it, an insight becoming a
   * hypothesis derived from it.
   *
   * WHERE it goes is the caller's: the good place depends on what is on
   * screen, which only a view knows.
   */
  | {
      readonly kind: 'DeriveObject'
      readonly toType: string
      readonly from: readonly ObjectId[]
      readonly predicate: string
      readonly x: number
      readonly y: number
      readonly id?: ObjectId
    }
  | {
      /**
       * A change another client already made. Refused unless `origin` is
       * `remote`; see `handlers/apply-remote-patches.ts` for why this is the one
       * command that carries patches rather than intent.
       */
      readonly kind: 'ApplyRemotePatches'
      readonly patches: readonly Patch[]
    }
  | {
      /**
       * Adds this person's reaction of this kind to an object, or takes it
       * away if they have already left one. One command either way, so it is
       * one undo step, and a toggle rather than two commands because which of
       * the two it is depends on the board at the moment it lands.
       */
      readonly kind: 'ToggleReaction'
      readonly target: ObjectId
      readonly glyph: string
      readonly by: MarkAuthor
    }
  | {
      /**
       * Starts the board's round of dot voting. A round that has ENDED is
       * replaced in the same command, so one undo brings it and its votes back;
       * one still open is never silently thrown away. Its id is not the
       * caller's: see `voteRoundId`.
       */
      readonly kind: 'StartVoteRound'
      readonly title: string
      readonly scope: VoteScope
      readonly perPerson: number
      readonly hidden: boolean
      readonly by: MarkAuthor
    }
  | {
      /** One more of this person's dots on a note, if they have one left. */
      readonly kind: 'CastDotVote'
      readonly round: ObjectId
      readonly target: ObjectId
      readonly by: MarkAuthor
    }
  | {
      /** Takes one of this person's dots back off a note. */
      readonly kind: 'RemoveDotVote'
      readonly round: ObjectId
      readonly target: ObjectId
      readonly by: MarkAuthor
    }
  | {
      /** Reveals the counts, or ends the round, or both. */
      readonly kind: 'SetVoteRound'
      readonly round: ObjectId
      readonly hidden?: boolean
      readonly status?: VoteRoundStatus
    }
  | {
      /**
       * This person's pick of an option on a poll, made — or taken back if
       * they had already made it. One command either way.
       */
      readonly kind: 'AnswerPoll'
      readonly poll: ObjectId
      readonly option: string
      readonly by: MarkAuthor
    }
  | {
      /**
       * Restore parentage for these objects after a merge. An id that no longer
       * exists is read as a former parent and its orphans checked instead.
       */
      readonly kind: 'RepairParentage'
      readonly ids: readonly ObjectId[]
    }

/** Where a reorder puts the objects within their container. */
export type Placement = 'front' | 'back' | 'forward' | 'backward'

export type CommandKind = Command['kind']

/**
 * A command plus who issued it and why.
 *
 * `origin` earns its place three times over: it is the audit trail, it lets AI
 * changes be previewed and rolled back as a group, and it is how a change from
 * another client (`remote`) or an agent (`mcp`) is told apart: the first never
 * lands in your undo stack, and the second is written to the board's change log
 * where anyone can take it back. Adding it later would have meant revisiting
 * every call site.
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
