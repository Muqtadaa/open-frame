import type {
  ClipboardContent,
  ConnectorEndpoint,
  ImageCrop,
  ObjectFrame,
  ObjectId,
  ObjectStyle,
  Point,
  Viewport,
  VoteScope,
} from '@openframe/core'
import type { StateCreator } from 'zustand'

import type { AlignmentGuide } from '../../scene/alignment.js'
import type { HandleId } from '../../scene/resize.js'
import type { Tool } from '../../scene/tools.js'

/*
 * What a tool is lives in `scene/tools.ts`: a chrome mode, or the name of a
 * type whose view declares one. Re-exported because most of the app reads
 * the tool from here.
 */
export type { Tool }

/** What a connect gesture makes when it lands. */
export interface ConnectMake {
  readonly type: string
  readonly data?: Readonly<Record<string, unknown>>
}

/** Something a toast can do, pressed from inside it. */
export interface ToastAction {
  readonly label: string
  readonly run: () => void
}

/** Where a comment is being written, before it exists. */
export interface ComposingComment {
  readonly x: number
  readonly y: number
  /** What was under the click, if anything. An association, not a location. */
  readonly objectId: ObjectId | null
  /**
   * Where on that element the click landed, as a proportion of its box.
   *
   * Measured HERE, when the click happens, rather than when the comment is
   * posted. Between the two the element may have been moved by somebody else
   * in the room, and a fraction taken from its new box would put the pin
   * somewhere nobody pointed at.
   */
  readonly on: { readonly fx: number; readonly fy: number } | null
}

/**
 * What a plain (unmodified) wheel gesture does.
 *
 * Mouse users overwhelmingly expect scroll to zoom on a canvas; trackpad users
 * often expect it to pan, because two-finger scroll is their pan gesture. There
 * is no default that suits both, so it is a preference — stored per browser,
 * never in the document.
 */
export type WheelMode = 'zoom' | 'pan'

/**
 * What the pointer is currently doing.
 *
 * `translate` holds a LIVE DELTA, not a position. Nothing is written to the
 * document while a drag is in flight — the renderer draws committed frame plus
 * delta, and one command is dispatched on pointer-up. That single rule is what
 * makes a 500-event drag one undo entry, one save and (later) one collaborative
 * update, and it is the reason this state lives here rather than in the board.
 */
export type DragState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'translate'
      /** A Set, not an array: every visible object tests membership on every drag frame. */
      readonly ids: ReadonlySet<ObjectId>
      readonly dx: number
      readonly dy: number
    }
  | { readonly kind: 'marquee'; readonly origin: Point; readonly current: Point }
  /**
   * Drawing a new object to size, the way every graphics tool creates a shape.
   *
   * Carries the type it will become so the preview can be drawn as that type
   * rather than as a generic rectangle, and so the commit needs nothing but
   * this state. Like every other gesture it writes NOTHING until pointer-up:
   * one command, one undo entry, however many frames the drag took.
   */
  | {
      readonly kind: 'draw'
      readonly objectType: string
      readonly data: Readonly<Record<string, unknown>> | undefined
      readonly origin: Point
      readonly current: Point
      /** Held Shift: a square, a circle, a frame with equal sides. */
      readonly constrained: boolean
    }
  | { readonly kind: 'pan' }
  /*
   * Resize and rotate carry PREVIEW FRAMES rather than writing to the document.
   * Same rule as dragging: the gesture is transient, and exactly one command is
   * dispatched when it commits.
   */
  | {
      readonly kind: 'resize'
      readonly handle: HandleId
      readonly frames: ReadonlyMap<ObjectId, ObjectFrame>
    }
  | { readonly kind: 'rotate'; readonly frames: ReadonlyMap<ObjectId, ObjectFrame> }
  /**
   * Dragging a division INSIDE an object — a table's column or row boundary.
   *
   * Carries a previewed DATA patch rather than a frame, because that is what
   * moving one changes. Same rule as every other transform: nothing reaches
   * the document until the pointer comes up, so widening a column across
   * forty frames is one undo entry.
   */
  /**
   * Trimming an image. Previews BOTH the frame and the window, because the two
   * move together by construction — the visible fraction shrinks by exactly
   * the proportion the frame does, which is what keeps the surviving pixels
   * still under the pointer.
   */
  | {
      readonly kind: 'crop'
      readonly objectId: ObjectId
      readonly handle: string
      /** Null until the pointer moves, like every other preview here. */
      readonly frame: ObjectFrame | null
      readonly crop: ImageCrop | null
    }
  | {
      readonly kind: 'divider'
      readonly objectId: ObjectId
      readonly dividerId: string
      /** What the object's data would become. Null until the pointer moves. */
      readonly data: Readonly<Record<string, unknown>> | null
      /**
       * How much bigger the object must be to hold that data.
       *
       * Resizing one track no longer takes the space from its neighbour, so a
       * table grows — and the preview has to carry that, or the drag looks
       * like it stops working at the point the old model would have run out
       * of room.
       */
      readonly grow: { readonly width: number; readonly height: number }
    }
  /** Drawing a connector: one end fixed, the other following the pointer. */
  | {
      readonly kind: 'connect'
      /**
       * What letting go makes. The armed tool's type rather than always a
       * connector: a type drawn between two things declares `place: 'connect'`
       * and must be the thing that gets made (Codex, on #20).
       */
      readonly make: ConnectMake
      readonly from: ConnectorEndpoint
      readonly to: Point
      /** The object currently under the pointer, highlighted as a drop target. */
      readonly over: ObjectId | null
      /**
       * RESHAPING an existing line rather than aiming one of its ends: which
       * object, and what its data would become if the pointer came up now.
       *
       * Dragging a control point used to rubber-band a dashed line from the
       * far end to the pointer, exactly as dragging an END does — which for a
       * bend is a diagonal to nowhere, while the line being bent sat still
       * until the drop. The route previews itself instead, merged in
       * `ObjectView` like a crop or a divider, so the document stays untouched
       * until pointer-up (rule 4).
       *
       * Null while a new connector is being drawn, and while an end is being
       * dragged: there the rubber band IS the honest preview of "this end
       * goes there", and the object under it highlights as a target.
       */
      readonly reshaping: {
        readonly objectId: ObjectId
        readonly data: Readonly<Record<string, unknown>>
      } | null
    }

/**
 * What a context menu hangs from, in screen pixels.
 *
 * A right-click is a POINT — a zero-sized box where the pointer was. A menu
 * asked for from the keyboard (Shift+F10, the menu key) hangs from the
 * SELECTION instead: the browser reports that one at the corner of whatever
 * had focus, which put the menu over the navigation bar, as far from the thing
 * it acts on as the window allows.
 */
export interface ContextMenuAt {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly via: 'pointer' | 'keyboard'
  /**
   * The board point the menu is ABOUT — where "Paste here" pastes and "Add a
   * note here" adds. The pointer, or the middle of what the keyboard's menu
   * hangs from.
   */
  readonly world: Point
}

/** The armed tool, what has been chosen for it, and this browser's input preferences. */
export interface ToolsSlice {
  readonly tool: Tool
  /**
   * What each tool has had chosen for it — which shape, how big a table — by
   * the type it makes. The tool declares what the options mean and where they
   * start; this only remembers them, so a new tool with options needs no
   * field here.
   */
  readonly toolOptions: Readonly<Record<string, unknown>>
  readonly wheelMode: WheelMode
  /**
   * Whether transforms snap to the grid. On by default; held Cmd/Ctrl overrides
   * it for the duration of a gesture without changing the preference.
   */
  readonly snapToGrid: boolean

  setTool(tool: Tool): void
  /** Remembers what was chosen for the tool that makes `type`. */
  setToolOptions(type: string, options: unknown): void
  setWheelMode(mode: WheelMode): void
  setSnapToGrid(enabled: boolean): void
  toggleSnapToGrid(): void
  toggleWheelMode(): void
}

/** What is selected, hovered, pointed at, being edited or cropped — and what somebody else holds. */
export interface SelectionSlice {
  readonly selection: ReadonlySet<ObjectId>
  readonly hoveredId: ObjectId | null
  /**
   * Where the pointer is, in world units, while no gesture is running.
   *
   * For chrome that only appears when you REACH for it: a connector offers a
   * midpoint on every stretch, and drawn all at once they turn a line into a
   * row of dots that hides the line. Null between visits — a stale position
   * would leave a handle hanging over a line nobody is pointing at.
   *
   * Held here rather than in the overlay that wants it because the canvas owns
   * pointer handling: a second listener on the same events is a second answer
   * to where the pointer is, and they disagree the moment one of them misses
   * an event.
   */
  readonly pointerWorld: Point | null
  readonly editingId: ObjectId | null
  /**
   * The image being cropped, if any.
   *
   * Separate from `editingId` because they are different modes that happen to
   * share a gesture: one puts a caret in some text, the other puts handles on
   * a picture, and an object that did both at once would have two overlays
   * fighting over the same box.
   */
  readonly croppingId: ObjectId | null
  /**
   * Where the pointer was when editing began, in world units, or `null` when
   * editing was started some other way — a keypress, or a command.
   *
   * INFORMATION, not behaviour. Most types ignore it entirely; a table uses it
   * to put the caret in the cell that was double-clicked rather than in the
   * first one, which is the difference between an editor that works and one
   * that looks broken the moment a grid has more than one cell.
   */
  readonly editingAt: Point | null
  /**
   * Objects somebody ELSE has open in an inline editor.
   *
   * Held here, rather than checked at the double-click that starts editing,
   * because `setEditing` is reachable from more than one place — a double
   * click, the keyboard, a promotion — and a guard on one of them is a guard
   * that the next caller walks straight past. One rule, at the one door.
   *
   * It is ADVISORY and that is not a compromise to fix later. Nothing can stop
   * another client writing: the document is a CRDT and the room arbitrates
   * nothing. What this prevents is two people typing into the same note at
   * once, which is the case where a merge genuinely loses words rather than
   * picking a winner. A hard lock would need a server granting leases, and a
   * lease whose holder closed their laptop is a note nobody can ever edit.
   */
  readonly lockedByOthers: ReadonlySet<ObjectId>
  setSelection(ids: readonly ObjectId[]): void
  toggleSelection(id: ObjectId): void
  clearSelection(): void
  setHovered(id: ObjectId | null): void
  setPointer(at: Point | null): void
  setEditing(id: ObjectId | null, at?: Point): void
  setCropping(id: ObjectId | null): void
  setLockedByOthers(ids: ReadonlySet<ObjectId>): void
  /** Drops references to objects that no longer exist (after delete or undo). */
  pruneSelection(exists: (id: ObjectId) => boolean): void
}

/** The camera: where the board is looked at from, whose view is being followed, how big the canvas is. */
export interface ViewportSlice {
  readonly viewport: Viewport
  /**
   * The client id whose viewport this browser is mirroring, or `null`.
   *
   * Transient and local, like everything else here: it says what THIS tab is
   * doing, and it is projected onto presence so that nobody follows a
   * follower. What arrives from other people is never read back into it.
   */
  readonly following: number | null
  /**
   * Size of the canvas element. Transient view state, but several things
   * outside the canvas need it — zoom-to-fit, centred zoom, the zoom slider —
   * and threading a ref through the tree for a number is worse than storing it.
   */
  readonly canvasSize: { readonly width: number; readonly height: number }
  setViewport(viewport: Viewport): void
  setFollowing(clientId: number | null): void
  setCanvasSize(width: number, height: number): void
}

/** The gesture in flight and everything it previews — written nowhere until it commits (rule 4). */
export interface GestureSlice {
  /**
   * Alignment guides for the gesture in flight. Empty between gestures, and
   * the SAME empty array each time — a fresh `[]` would fail `Object.is` and
   * re-render every subscriber on every pointer move (rule 9).
   */
  readonly guides: readonly AlignmentGuide[]
  readonly drag: DragState
  /**
   * Alt is held: the board measures from the selection to whatever is under
   * the pointer, and between the selected things themselves. A hold rather
   * than a tool, so it is never left on by accident.
   */
  readonly measuring: boolean
  /**
   * The selection was just moved by the arrow keys: the board says how far it
   * is from its neighbours, and where it lines up, until the hand goes back to
   * the mouse or another key — or a moment passes with nothing pressed.
   */
  readonly nudging: boolean
  /**
   * A style being aimed at in the record panel — a colour dragged across the
   * picker, an opacity slid — drawn on the selection and written NOWHERE.
   *
   * These are gestures like any drag, and they were writing like none of
   * them: every pointer move in the picker dispatched `UpdateStyle`, so one
   * drag left about twenty undo entries (rule 4, rule 14). The panel previews
   * here and dispatches once when the gesture ends; `ObjectView` merges this
   * into what it draws, exactly as it merges a crop or a divider.
   *
   * Beside `drag` rather than inside it: the canvas is not dragging, and a
   * style preview must survive the canvas starting or ending a gesture of
   * its own.
   */
  readonly stylePreview: {
    readonly ids: ReadonlySet<ObjectId>
    readonly style: ObjectStyle
  } | null
  setGuides(guides: readonly AlignmentGuide[]): void
  setMeasuring(measuring: boolean): void
  setNudging(nudging: boolean): void
  beginCrop(objectId: ObjectId, handle: string): void
  previewCrop(frame: ObjectFrame, crop: ImageCrop): void
  previewStyle(ids: ReadonlySet<ObjectId>, style: ObjectStyle): void
  clearStylePreview(): void
  beginDivider(objectId: ObjectId, dividerId: string): void
  previewDivider(
    data: Readonly<Record<string, unknown>>,
    grow: { readonly width: number; readonly height: number },
  ): void
  beginTranslate(ids: readonly ObjectId[]): void
  updateTranslate(dx: number, dy: number): void
  beginMarquee(origin: Point): void
  /** Starts drawing a new object to size. Nothing is created until it commits. */
  beginDraw(
    objectType: string,
    at: Point,
    data: Readonly<Record<string, unknown>> | undefined,
  ): void
  updateDraw(current: Point, constrained: boolean): void
  updateMarquee(current: Point): void
  beginPan(): void
  beginResize(handle: HandleId): void
  beginRotate(): void
  beginConnect(from: ConnectorEndpoint, at: Point, make?: ConnectMake): void
  updateConnect(
    to: Point,
    over: ObjectId | null,
    reshaping?: {
      readonly objectId: ObjectId
      readonly data: Readonly<Record<string, unknown>>
    } | null,
  ): void
  /** Replaces the live preview frames mid-gesture. */
  previewFrames(frames: ReadonlyMap<ObjectId, ObjectFrame>): void
  endDrag(): void
}

/** Comments being written and read, and what this client has said. */
export interface DiscussionSlice {
  /**
   * A comment being written but not yet posted, and the thread being read.
   *
   * Both transient and local, like everything else here. A comment is not a
   * canvas object and never goes near the document — it belongs to the board
   * the way a conversation belongs to a room, which is why it lives in its own
   * table and not in the object registry.
   */
  readonly composing: ComposingComment | null
  readonly openThreadId: string | null
  /**
   * Whether the comments panel is showing, independently of whether a thread
   * is open.
   *
   * Choosing the comment tool is saying you are about to read or write one, so
   * it opens. Closing it is a decision that sticks until the tool is chosen
   * again — a panel that reappeared every time the mode changed would be one
   * you cannot put away.
   */
  readonly commentsOpen: boolean
  /**
   * How many times this client has changed the discussion.
   *
   * Published in presence so everybody else in the room knows to re-read. It
   * is a count rather than a flag because a flag cannot be raised twice: two
   * comments in a row would set an already-set boolean and the second would
   * reach nobody.
   */
  readonly said: number
  setCommentsOpen(open: boolean): void
  startComment(at: ComposingComment | null): void
  openThread(id: string | null): void
  /** Says that this client just changed the discussion. */
  noteSaid(): void
}

/** What the chrome is showing: a toast, an announcement, a menu, search — and the clipboard. */
export interface ChromeSlice {
  /**
   * A transient message for something the user did that could not be done —
   * an unsupported file, say. Not an error channel: failures the user did not
   * cause belong in the notice banner, which persists.
   */
  readonly toast: string | null
  /**
   * What the toast offers to do about itself, if anything — "Revert" on an
   * agent's change (tracks A-2). A toast with an action is news rather than a
   * refusal, so it is drawn on the panel stock, not in the failure red.
   */
  readonly toastAction: ToastAction | null
  /**
   * What the board last said to a screen reader about something done from the
   * keyboard — "Width 180, height 120", "Locked". `serial` makes the same
   * words said twice a new announcement rather than no change.
   */
  readonly announcement: { readonly text: string; readonly serial: number } | null
  /**
   * The last copy made in this tab, held in memory rather than the system
   * clipboard: what the board's own cut, copy and paste use.
   *
   * In the board's own copy format (`ClipboardContent`), which is what a paste
   * reads, so a copy of a frame brings its contents and a copied line keeps
   * its ends. Cross-tab paste is the deliberate gap, closed by putting this
   * same content on the system clipboard.
   */
  readonly clipboard: ClipboardContent | null
  /** Where the open context menu hangs from, or null. */
  readonly contextMenu: ContextMenuAt | null
  /**
   * Whether the search panel is open.
   *
   * Interaction state, not document state: what someone is looking for is not
   * part of the board, and a search open in one tab has nothing to say to
   * another person's.
   */
  readonly searchOpen: boolean
  /** Whether the board overview is open (Alt+S). Interaction state, like search. */
  readonly overviewOpen: boolean
  /** Whether the Session sheet — timer and music — is open (Alt+T). */
  readonly sessionOpen: boolean
  /**
   * Whether the account sheet — or, signed out, the sign-in sheet — is open.
   * Here rather than in the control, so something that needs an account (AI)
   * can open the way to one.
   */
  readonly accountOpen: boolean
  /**
   * The full emoji library, open for reacting to `targets`, hung from `anchor`
   * (a SCREEN rectangle: the bar's More button, or the selection when it was
   * opened from the context menu). Null when closed.
   */
  readonly reactionPicker: {
    readonly targets: readonly ObjectId[]
    readonly anchor: { x: number; y: number; width: number; height: number }
  } | null
  showToast(message: string | null, action?: ToastAction): void
  announce(text: string): void
  setClipboard(content: ClipboardContent | null): void
  openContextMenu(at: ContextMenuAt): void
  closeContextMenu(): void
  setSearchOpen(open: boolean): void
  setOverviewOpen(open: boolean): void
  setSessionOpen(open: boolean): void
  setAccountOpen(open: boolean): void
  openReactionPicker(picker: NonNullable<ChromeSlice['reactionPicker']>): void
  closeReactionPicker(): void
  /**
   * The notes a round of dot voting is being set up for, while its form is
   * open. Null otherwise. Nothing is on the board until it is started.
   */
  readonly votingSetup: VoteScope | null
  openVotingSetup(scope: VoteScope): void
  closeVotingSetup(): void
  /**
   * The notes being clustered with AI, from asking through to applying or
   * discarding what came back. Null otherwise. Held as the ids chosen when it
   * opened, so selecting something else meanwhile changes nothing.
   */
  readonly clusterReview: readonly ObjectId[] | null
  openClusterReview(ids: readonly ObjectId[]): void
  closeClusterReview(): void
}

/**
 * TRANSIENT, CLIENT-ONLY state.
 *
 * Everything here is deliberately absent from the board document: it belongs to
 * this browser tab and this moment. When multiplayer arrives, a few of these
 * (selection, drag delta, viewport) are PROJECTED onto presence so others can
 * see them — but this store stays authoritative locally, and presence is never
 * read back into it.
 */
export type InteractionState = ToolsSlice &
  SelectionSlice &
  ViewportSlice &
  GestureSlice &
  DiscussionSlice &
  ChromeSlice

/**
 * One slice of the store. It is handed the WHOLE state's `set` and `get`,
 * because a few actions reach across — choosing a tool ends an edit — and each
 * of those says so where it does it.
 */
export type Slice<T> = StateCreator<InteractionState, [], [], T>
