import { createContext, useContext } from 'react'

import type { BoardDocument, BoardId, BoardRepository, ObjectId } from '@openframe/core'

import type { OpenFrameRuntime } from './context.js'

/**
 * Everything the interface asks of the outside world, as ports.
 *
 * The UI used to reach the network by importing `app/` modules that were
 * re-exports of adapters — so `ui-does-not-touch-persistence` held on paper
 * and meant nothing, and three use cases called the rooms worker with the
 * global `fetch`, reachable in a test only by replacing it. Now every piece of
 * I/O the interface can cause is a method on one of these, the composition
 * root builds the one bundle, and a test hands in a fake.
 *
 * Interfaces only. The shapes the services speak in live here too, because a
 * port that borrowed its types from an adapter would depend on the thing it
 * exists to hide.
 */

// ── The shapes ───────────────────────────────────────────────────────────

export interface Identity {
  readonly userId: string
  readonly email: string | null
  readonly displayName: string
  /** An index into the presence palette, never a colour. */
  readonly hue: number
  /**
   * The current access token, for the room to check.
   *
   * Read fresh rather than stored: it is refreshed on a timer, and a copy kept
   * in a component is a token that expires while the tab is open.
   */
  readonly accessToken: string
}

export interface AuthResult {
  readonly ok: boolean
  /** Written for the person who hit it, not copied from the provider. */
  readonly message?: string
}

export interface RemoteBoard {
  readonly boardId: BoardId
  readonly title: string
  /** What this person may do with it, as the database computed it. */
  readonly role: 'owner' | 'editor' | 'viewer'
  /** The key that opens it for that role. `null` for a board shared before roles. */
  readonly accessKey: string | null
  /**
   * The VIEW-ONLY key, for a board you own and nobody else's.
   *
   * An owner already holds the editor key, which is strictly more powerful, so
   * handing them both leaks nothing — and without it the view-only link was
   * visible once, in the panel that appears when a board is shared, and
   * unrecoverable afterwards.
   */
  readonly viewKey: string | null
  /**
   * The OWNER's key, for a board you own and nobody else's.
   *
   * Not a link — it is never put in one. It authorizes the board's password
   * and excuses its owner from being asked for it.
   */
  readonly ownerKey: string | null
  readonly updatedAt: number
  /** Whether YOU pinned it. Nobody else's pin is visible, or any of their business. */
  readonly pinned: boolean
  /**
   * When YOU last opened it, which is what the list is ordered by.
   *
   * Not `updatedAt`: that is when the board last CHANGED, which on a shared
   * board is somebody else's typing — so ordering by it let a collaborator
   * working at midnight rearrange your list while you slept.
   */
  readonly openedAt: number
  /**
   * The workspace this board lives in. Every board has one.
   *
   * Not optional, and that is the point of the migration that introduced it:
   * a board without a workspace would be a second case in every listing and
   * every access check, kept alive forever by boards nobody moved.
   */
  readonly workspaceId: string
  readonly workspaceName: string
}

export interface BoardComment {
  readonly id: string
  /** `null` on a thread; the thread's id on a reply. */
  readonly parentId: string | null
  readonly authorId: string
  readonly authorName: string
  readonly authorHue: number
  readonly body: string
  /** Where the pin sits, in board coordinates. `null` on a reply. */
  readonly x: number | null
  readonly y: number | null
  /**
   * What it was dropped on, if anything.
   *
   * An object that is later deleted leaves the comment exactly where it was
   * put, and the interface says what it was attached to is gone.
   */
  readonly objectId: ObjectId | null
  /**
   * WHERE on that element, as a proportion of its box.
   *
   * `0.5, 0.5` is the middle; `1, 0` is the top-right corner. A proportion
   * rather than an offset so the pin survives a RESIZE as well as a move —
   * the corner somebody was objecting to stays the corner.
   *
   * `null` on a comment that is not on an element, and on every comment
   * written before this existed. Those keep their own `x` and `y`, which is
   * also the fallback for an anchored comment whose element has been deleted:
   * a fraction of something that is gone is not a position, and the pin has to
   * go somewhere.
   */
  readonly fx: number | null
  readonly fy: number | null
  readonly resolvedAt: number | null
  readonly createdAt: number
  /** When its author last changed its words; `null` on one never edited. */
  readonly editedAt: number | null
}

export interface BoardPerson {
  readonly userId: string
  readonly displayName: string
  readonly hue: number
}

export interface Mention {
  readonly commentId: string
  readonly boardId: BoardId
  readonly boardTitle: string
  readonly authorName: string
  readonly body: string
  readonly createdAt: number
  /**
   * When this was read, or `null` while it is still new.
   *
   * Read and GONE are two different states. The list used to return only the
   * unread, so following a notification was the last time you could ever find
   * it — the thing somebody wanted you to see disappeared at the moment you
   * looked at it, along with the only link back to the board and remark it
   * named.
   */
  readonly readAt: number | null
}

export interface NewComment {
  readonly boardId: BoardId
  readonly body: string
  /** Set on a reply, absent on a thread. */
  readonly parentId?: string
  /** Set on a thread, absent on a reply. */
  readonly at?: { readonly x: number; readonly y: number }
  readonly objectId?: ObjectId | null
  /**
   * Where on that element, as a proportion of its box. Set together with
   * `objectId` or not at all — a fraction of nothing is not a position, and
   * the database refuses one.
   */
  readonly on?: { readonly fx: number; readonly fy: number }
  readonly mentions?: readonly string[]
}

export interface Workspace {
  readonly id: string
  readonly name: string
  /** The one every account is given. Not a permission — a label for the list. */
  readonly personal: boolean
  readonly role: WorkspaceRole
  /**
   * The links, for an admin and nobody else.
   *
   * Null for an editor or a viewer, because inviting is what `admin` means: a
   * link everybody can see is a link anybody can widen the workspace with.
   */
  readonly editorKey: string | null
  readonly viewerKey: string | null
  readonly boards: number
}

/**
 * A board as the front door lists it, from either place it can live.
 *
 * The two are shown together rather than in separate sections, because "the
 * board I was working on" is one idea and the person does not care which
 * storage it happens to be in. What they do care about is whether other people
 * can see it, which is what `shared` says.
 */
export interface ListedBoard {
  readonly boardId: BoardId
  readonly title: string
  readonly updatedAt: number
  readonly shared: boolean
  /** Only meaningful for a shared board; `null` for one with no account behind it. */
  readonly role: RemoteBoard['role'] | null
  /** The key that opens it, for a shared board that has one. */
  readonly accessKey: string | null
  /** The view-only key, for a board you own. `null` for anybody else's. */
  readonly viewKey: string | null
  /** The owner's key, which is not a link. `null` for anybody else's. */
  readonly ownerKey: string | null
  readonly pinned: boolean
  /** When YOU last opened it. What the list is ordered by. */
  readonly openedAt: number
  /**
   * The workspace it lives in, or `null` for a board that lives only in this
   * browser.
   *
   * Null is not a gap to be filled. A local board is in no workspace because
   * there is nobody else involved; claiming it into an account is what gives
   * it one.
   */
  readonly workspaceId: string | null
}

export type WorkspaceRole = 'admin' | 'editor' | 'viewer'

// ── The rooms worker ─────────────────────────────────────────────────────

/** The keys a room hands out once, when it is claimed. */
export interface RoomKeys {
  readonly editor: string
  readonly viewer: string
  /** Absent only from a room running a build older than owner keys. */
  readonly owner?: string
}

/**
 * How a request to the room went, without the words for it.
 *
 * The wording is the use case's: the same refusal reads differently on the
 * front door and in the password sheet, and a transport that chose the
 * sentence would be choosing it for both.
 */
export type RoomFailure = 'unreachable' | 'refused' | 'unreadable'

export interface RoomService {
  /**
   * Whether the board asks for a password, for somebody holding a way in.
   * `null` when that cannot be told — never read as "no".
   */
  readonly hasPassword: (boardId: BoardId, key: string) => Promise<boolean | null>
  readonly claim: (
    boardId: BoardId,
  ) => Promise<{ ok: true; keys: RoomKeys } | { ok: false; reason: RoomFailure }>
  /** Mints an owner key for a board claimed before owner keys existed. */
  readonly adoptOwnerKey: (boardId: BoardId, editorKey: string) => Promise<string | null>
  /**
   * `throttled` is a board rationing attempts after too many wrong guesses:
   * the password was not looked at, so it is not a refusal.
   */
  readonly unlock: (
    boardId: BoardId,
    key: string | null,
    password: string,
  ) => Promise<
    | { ok: true; token: string }
    | { ok: false; reason: RoomFailure }
    | { ok: false; reason: 'throttled'; retryAfterSeconds: number }
  >
  readonly setPassword: (
    boardId: BoardId,
    ownerKey: string,
    password: string | null,
  ) => Promise<
    | { ok: true }
    | { ok: false; reason: 'unreachable' }
    | { ok: false; reason: 'refused'; message: string | null }
  >
  /**
   * Destroys the room. Takes the OWNER key: the edit link is handed to
   * everybody invited to change the board, and is not the authority to end it.
   * `needs-owner` is a board claimed before owner keys existed, asked without
   * one — it must adopt a key first. `unfinished` is a room that could not
   * delete all of the board's images and so kept the board, keys and all, for
   * the same request to be made again.
   */
  readonly destroy: (
    boardId: BoardId,
    ownerKey: string,
  ) => Promise<
    'destroyed' | 'gone' | 'legacy' | 'needs-owner' | 'unfinished' | 'refused' | 'unreachable'
  >
}

// ── Accounts and what they hold ──────────────────────────────────────────

export interface AccountService {
  /** Whether this build has accounts at all. */
  readonly enabled: boolean
  readonly current: () => Promise<Identity | null>
  readonly onChange: (listener: (identity: Identity | null) => void) => () => void
  readonly signIn: (email: string, password: string) => Promise<AuthResult>
  readonly signUp: (email: string, password: string, displayName: string) => Promise<AuthResult>
  readonly signOut: () => Promise<void>
}

export interface RemoteBoardService {
  readonly listMine: () => Promise<readonly RemoteBoard[]>
  readonly recordShared: (board: {
    readonly boardId: BoardId
    readonly title: string
    readonly editorKey: string
    readonly viewerKey: string
    readonly ownerKey?: string
    readonly workspaceId?: string
  }) => Promise<boolean>
  readonly recordOwnerKey: (boardId: BoardId, ownerKey: string) => Promise<boolean>
  readonly join: (boardId: BoardId, key: string) => Promise<RemoteBoard['role'] | null>
  readonly setPinned: (boardId: BoardId, pinned: boolean) => Promise<boolean>
  readonly touchOpened: (boardId: BoardId) => Promise<void>
  readonly remove: (boardId: BoardId) => Promise<boolean>
  readonly leave: (boardId: BoardId) => Promise<boolean>
  readonly rename: (boardId: BoardId, title: string) => Promise<boolean>
}

export interface DiscussionService {
  readonly list: (boardId: BoardId) => Promise<readonly BoardComment[]>
  readonly people: (boardId: BoardId) => Promise<readonly BoardPerson[]>
  readonly post: (comment: NewComment) => Promise<string | null>
  readonly resolve: (id: string, resolved: boolean) => Promise<boolean>
  /** Rewrites a remark's words; its author's alone. */
  readonly edit: (id: string, body: string) => Promise<boolean>
  /** Deletes a remark; its author's alone, and never a thread others replied to. */
  readonly remove: (id: string) => Promise<boolean>
  readonly mentions: () => Promise<readonly Mention[]>
  readonly markRead: (commentIds: readonly string[]) => Promise<boolean>
  readonly watchMentions: (userId: string, onChange: () => void) => () => void
}

export interface WorkspaceService {
  readonly listMine: () => Promise<readonly Workspace[]>
  readonly create: (name: string) => Promise<string | null>
  readonly share: (id: string) => Promise<{ editorKey: string; viewerKey: string } | null>
  readonly join: (id: string, key: string) => Promise<WorkspaceRole | null>
}

// ── What the interface does with them ────────────────────────────────────

export interface SharedBoard {
  readonly boardId: BoardId
  /** Whoever holds this can change the board. */
  readonly editLink: string
  /** Whoever holds this can watch it, and be seen watching. */
  readonly viewLink: string
}

/** Sharing or starting a board failed, with a reason written for the person. */
export class ShareFailed extends Error {}

export type Outcome = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * The gestures that are several of the above in an order that matters —
 * sharing writes before it removes, deleting removes the furthest thing first.
 * The order lives in `app/`, once; this is what the interface calls.
 */
export interface BoardService {
  /** Everything this person can open, pinned first. */
  readonly listAll: (signedIn: boolean) => Promise<readonly ListedBoard[]>
  /** A board of this browser's own, for a build with no accounts. */
  readonly createLocal: (title?: string) => Promise<BoardId>
  readonly createOwned: (title?: string, workspaceId?: string) => Promise<SharedBoard>
  /** Moves the board on screen into a room. The runtime is disposed on the way. */
  readonly shareCurrent: (runtime: OpenFrameRuntime) => Promise<SharedBoard>
  readonly claimLocal: (boardId: BoardId) => Promise<BoardId>
  readonly deleteEverywhere: (board: {
    readonly boardId: BoardId
    readonly shared: boolean
    readonly accessKey: string | null
    /** What the room checks before destroying. Adopted when a board has none. */
    readonly ownerKey?: string | null
  }) => Promise<Outcome>
  readonly leave: (boardId: BoardId) => Promise<Outcome>
  readonly forgetDeleted: (boardId: BoardId) => Promise<void>
  readonly rename: (
    board: {
      readonly boardId: BoardId
      readonly shared: boolean
      readonly accessKey?: string | null
      readonly title?: string
    },
    title: string,
  ) => Promise<boolean>
  /** A deleted board's content, kept as a new local board. */
  readonly keepCopy: (document: BoardDocument) => Promise<BoardId>
}

export interface PasswordService {
  readonly unlock: (boardId: BoardId, key: string | null, password: string) => Promise<Outcome>
  readonly set: (
    boardId: BoardId,
    keys: { readonly owner: string | null; readonly editor: string },
    password: string | null,
  ) => Promise<Outcome>
  readonly recoverOwnerKey: (boardId: BoardId) => Promise<string | null>
  /** Keeps an owner key this browser was just handed, so opening the board needs no lookup. */
  readonly rememberOwnerKey: (boardId: BoardId, key: string) => void
  readonly ownedKeys: (boardId: BoardId) => Promise<{
    readonly edit: string | null
    readonly view: string
    readonly owner: string | null
  } | null>
}

export interface Services {
  /** This browser's boards. The front door has no runtime, so it reads them here. */
  readonly repository: BoardRepository
  readonly rooms: RoomService
  readonly accounts: AccountService
  readonly remoteBoards: RemoteBoardService
  readonly discussion: DiscussionService
  readonly workspaces: WorkspaceService
  readonly boards: BoardService
  readonly passwords: PasswordService
}

export const ServicesContext = createContext<Services | null>(null)

/**
 * The outside world, as the interface may reach it.
 *
 * Provided around BOTH routes: the front door has no board runtime, and it is
 * where most of this is used.
 */
export function useServices(): Services {
  const value = useContext(ServicesContext)
  if (value === null) throw new Error('useServices must be used inside <ServicesContext.Provider>')
  return value
}
