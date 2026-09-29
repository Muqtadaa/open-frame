import type {
  ColorToken,
  DispatchResult,
  ObjectStyle,
  ConnectorEndpoint,
  EndpointTarget,
  ObjectFrame,
  ObjectId,
  Placement,
  Point,
  Rect,
  TransactionId,
} from '@openframe/core'
import {
  copySpec,
  groupByParent,
  uncrop,
  unionAll,
  type AlignEdge,
  type DistributeAxis,
  type ImageCrop,
} from '@openframe/core'
import { useMemo } from 'react'

import type { LoggedChange } from '@openframe/collab'
import { guestIdentity } from '../app/guest.js'
import { useOpenFrame } from '../runtime/context.js'
import { useServices } from '../runtime/services.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { objectsInMarquee } from '../scene/hit-testing.js'
import { pasteOrigin } from '../scene/paste.js'
import { snapPoint } from '../scene/snapping.js'
import { placeDerived } from '../scene/derived-placement.js'
import { panToReveal } from '../scene/zoom.js'

export interface BoardCommands {
  /** Creates any registered type. No per-type method — that is the registry's job. */
  /** Creates a connector between two resolved endpoints. */
  /**
   * Makes a line between two ends — a connector, or whatever type the armed
   * tool says it is, with the data its options give it.
   */
  createConnector(
    from: ConnectorEndpoint,
    to: ConnectorEndpoint,
    make?: { readonly type: string; readonly data?: Readonly<Record<string, unknown>> },
  ): ObjectId | null
  createObject(type: string, at: Point, data?: Readonly<Record<string, unknown>>): ObjectId | null
  /**
   * Creates an object at an explicit rectangle, for a draw-to-size gesture.
   *
   * Separate from `createObject` rather than an optional size on it, because
   * the two answer different questions: one is told where to put something the
   * TYPE has sized, the other is told exactly what rectangle to fill.
   */
  createObjectInRect(
    type: string,
    rect: Rect,
    data?: Readonly<Record<string, unknown>>,
  ): ObjectId | null
  duplicateSelection(): void
  copySelection(): void
  cutSelection(): void
  paste(at?: Point): void
  selectAll(): void
  /** Renames the board. Returns false when the name was refused. */
  setBoardTitle(title: string): boolean
  moveObjects(moves: readonly { id: ObjectId; dx: number; dy: number }[]): void
  /** Commits a drag that also changes frame membership, as ONE undoable action. */
  moveAndReparent(
    moves: readonly { id: ObjectId; dx: number; dy: number }[],
    parentId: ObjectId | null,
  ): void
  resizeObjects(resizes: readonly { id: ObjectId; frame: ObjectFrame }[]): void
  rotateObjects(rotations: readonly { id: ObjectId; rotation: number }[]): void
  reorder(placement: Placement): void
  /** Wraps the selection in a group. Needs at least two objects to mean anything. */
  group(): void
  /** Dissolves any groups in the selection, keeping their members. */
  ungroup(): void
  /** A new crop window and the frame that shows it, as one undoable action. */
  cropImage(id: ObjectId, crop: ImageCrop, frame: ObjectFrame): void
  /** Puts the whole picture back, growing the frame to match. */
  uncropImage(id: ObjectId): void
  /** Lines the selection up on one edge of its own bounding box. */
  align(edge: AlignEdge): void
  /** Evens out the gaps between the selection, along one axis. */
  distribute(axis: DistributeAxis): void
  setLocked(locked: boolean): void
  setHidden(hidden: boolean): void
  deleteSelection(): void
  /**
   * A divider's new data AND the size the object needs to hold it, as ONE
   * undoable action.
   *
   * Two commands rather than one because they are two different changes —
   * weights are data, a frame is geometry — and `transact` is what makes a
   * drag that produced both still a single step to undo. Rule 4 is about one
   * ACTION per gesture, not one command.
   */
  resizeDivider(id: ObjectId, patch: Readonly<Record<string, unknown>>, frame: ObjectFrame): void
  updateData(id: ObjectId, patch: Readonly<Record<string, unknown>>): void
  /**
   * An edit that also changed the object's size — a table whose track was
   * fitted or dragged while it was open — as one undo entry.
   */
  updateDataAndSize(
    id: ObjectId,
    patch: Readonly<Record<string, unknown>>,
    frame: ObjectFrame,
  ): void
  /** Promotes the selection to another type, keeping every object's identity. */
  promoteSelection(toType: string): void
  /**
   * Creates an object of `toType` above the selection, related back to every
   * member of it.
   *
   * The synthesis motion, generalised: a cluster of evidence becomes an insight
   * citing it, an insight becomes a hypothesis derived from it, and so on down
   * the spine. WHICH derivations exist and what their relations mean are the
   * registry's business — this only carries them out.
   */
  derive(toType: string, predicate: string): ObjectId | null
  /**
   * Selects an object and pans the minimum needed to see it.
   *
   * Selecting something off-screen leaves the record panel describing an object
   * the user cannot find, which reads as the panel being wrong rather than the
   * view being elsewhere.
   */
  reveal(id: ObjectId): void
  /** Moves one draggable end of an object. The TYPE decides what that means. */
  retargetEndpoint(id: ObjectId, endpointId: string, target: EndpointTarget): void
  setColor(ids: readonly ObjectId[], color: ColorToken): void
  /**
   * Sets any style properties at once. `setColor` is the one-property case kept
   * for its call sites; this is what the inspector uses, because a type's
   * honoured properties come from its registry entry, not from a fixed list.
   */
  setStyle(ids: readonly ObjectId[], style: ObjectStyle): void
  undo(): void
  redo(): void
  /**
   * Takes back one change an agent made, from the board's change log (tracks
   * A-2), as this person's own step — so Cmd+Z puts it back. Whatever anybody
   * changed since is kept. The revert's own transaction, so an undo of it can
   * be recognised, or `null` when nothing could be taken back.
   */
  revertChange(change: LoggedChange): TransactionId | null
}

/**
 * The thin bridge between React and the command layer.
 *
 * Deliberately thin: it constructs commands and reports failures, and contains
 * no business rules whatsoever. Validation, locking, authorization, ordering
 * and undo all happen on the other side of `dispatch`, where they can be tested
 * without a renderer and reused by AI, the API and MCP.
 *
 * If logic starts accumulating here, it belongs in a command handler instead.
 */
/** Enough offset that a copy is visibly a copy, not a misclick. */
const DUPLICATE_OFFSET = 24
/** Clearance between a new insight and the evidence it was drawn from. */
const SYNTHESIS_GAP = 80

export function useCommands(): BoardCommands {
  const { runtime, collaboration } = useOpenFrame()
  const { remoteBoards } = useServices()
  const dispatcher = runtime.dispatcher

  return useMemo<BoardCommands>(() => {
    const report = (result: { ok: boolean; error?: unknown }): void => {
      if (!result.ok) console.warn('[openframe] command rejected', result.error)
    }

    /*
     * An undo or redo that could not happen says so, where the person is
     * looking. Somebody else — another person, or an agent — may have deleted
     * or locked what the step would restore; the dispatcher leaves those out
     * rather than throwing, and a press that silently did nothing would read
     * as a broken shortcut.
     */
    const sayWhyNot = (result: DispatchResult | null): void => {
      if (result === null || result.ok) return
      useInteractionStore
        .getState()
        .showToast(
          result.error.code === 'unauthorized' ? 'This board is read-only.' : result.error.message,
        )
    }

    /*
     * Shared by synthesis and the provenance trail, so "show me that object"
     * means one thing. Declared as a closure rather than a method on the
     * returned object, because a method calling a sibling through `this` breaks
     * the moment anyone destructures the hook's result.
     */
    const revealObject = (id: ObjectId): void => {
      const store = useInteractionStore.getState()
      const doc = runtime.store.getDocument()
      const object = doc.objects.get(id)
      if (object === undefined) return
      store.setSelection([id])
      // Nothing to pan to for an object with no place on the board.
      if (runtime.registry.get(object.type)?.capabilities.spatial === false) return
      store.setViewport(
        panToReveal(
          store.viewport,
          runtime.registry.boundsOf(object, doc),
          store.canvasSize.width,
          store.canvasSize.height,
        ),
      )
    }

    /**
     * Puts a new object at an exact rectangle, adopting what it lands on.
     *
     * Shared by click-to-place and draw-to-size so the two cannot drift: a
     * frame drawn around three notes and a frame dropped on top of them must
     * end up holding the same three notes.
     */
    const placeObject = (
      type: string,
      rect: Rect,
      data: Readonly<Record<string, unknown>> | undefined,
    ): ObjectId | null => {
      const definition = runtime.registry.get(type)
      if (definition === undefined) return null

      const id = runtime.ids.objectId()
      const spec = {
        type,
        id,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        ...(data === undefined ? {} : { data: { ...data } }),
      }

      /*
       * A container adopts what it lands on.
       *
       * Dropping a frame over existing notes used to leave them where they
       * were — outside it — so the frame painted over them and they simply
       * vanished, and moving the frame left them behind. A frame drawn AROUND
       * something means that something is in it; that is the only reading.
       *
       * Only top-level objects are taken. An object already inside another
       * frame belongs to that frame, and a container that quietly stole
       * another's contents would be worse than one that adopted nothing.
       */
      const doc = runtime.store.getDocument()
      const adopts = definition.capabilities.canHaveChildren
        ? objectsInMarquee(doc, runtime.registry, rect).filter(
            (other) => (doc.objects.get(other)?.parentId ?? null) === null,
          )
        : []

      const result =
        adopts.length === 0
          ? dispatcher.dispatch({ kind: 'CreateObjects', objects: [spec] })
          : // One transaction, so undoing the placement also undoes the
            // adoption — otherwise undo leaves the notes parented to a frame
            // that no longer exists.
            dispatcher.transact(`Create ${type}`, [
              { kind: 'CreateObjects', objects: [spec] },
              { kind: 'ReparentObjects', ids: adopts, parentId: id },
            ])
      report(result)
      return result.ok ? id : null
    }

    /** The selection as a command's ids, or nothing to do when it is empty. */
    const selected = (): ObjectId[] => [...useInteractionStore.getState().selection]

    return {
      createObject(type, at, data) {
        const definition = runtime.registry.get(type)
        if (definition === undefined) {
          console.warn(`[openframe] no such object type "${type}"`)
          return null
        }
        // Centre the new object on the click point, which is what users expect.
        // The default size comes from the type, so this stays correct for types
        // that do not exist yet.
        const { frame } = definition.create(data === undefined ? undefined : { ...data })
        // Snapped at creation as well as on move: otherwise a board is off-grid
        // from its very first object and snapping only ever half-applies.
        const origin = { x: at.x - frame.width / 2, y: at.y - frame.height / 2 }
        const placed = useInteractionStore.getState().snapToGrid ? snapPoint(origin) : origin
        return placeObject(type, { ...placed, ...frame }, data)
      },

      createObjectInRect(type, rect, data) {
        if (runtime.registry.get(type) === undefined) {
          console.warn(`[openframe] no such object type "${type}"`)
          return null
        }
        // Already snapped by the gesture, which snaps both EDGES rather than a
        // corner and a size — see scene/draw.ts.
        return placeObject(type, rect, data)
      },

      createConnector(from, to, make = { type: 'connector' }) {
        const result = dispatcher.dispatch({
          kind: 'CreateObjects',
          objects: [
            {
              type: make.type,
              // A connector's position comes from its endpoints; the frame is
              // vestigial and deliberately zero.
              x: 0,
              y: 0,
              data: { ...make.data, from, to },
            },
          ],
        })
        report(result)
        return result.ok ? (result.affected[0] ?? null) : null
      },

      align(edge) {
        const ids = selected()
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'AlignObjects', ids, edge }))
      },
      distribute(axis) {
        const ids = selected()
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'DistributeObjects', ids, axis }))
      },
      group() {
        const ids = selected()
        // One object is already a unit. The command refuses it too; a shortcut
        // pressed on one object is not worth a warning.
        if (ids.length < 2) return
        // Minted here so the new group can be selected once it exists.
        const id = runtime.ids.objectId()
        const result = dispatcher.dispatch({ kind: 'GroupObjects', ids, id })
        report(result)
        if (result.ok) useInteractionStore.getState().setSelection([id])
      },

      reveal: revealObject,

      derive(toType, predicate) {
        const store = useInteractionStore.getState()
        const doc = runtime.store.getDocument()
        const cited = [...store.selection]
          .map((id) => doc.objects.get(id))
          .filter((object) => object !== undefined)
          // A relation to something with no place on the board would be a
          // citation of a citation, which nothing today means.
          .filter((object) => runtime.registry.get(object.type)?.capabilities.spatial !== false)
        if (cited.length === 0) return null

        const bounds = unionAll(cited.map((object) => runtime.registry.boundsOf(object, doc)))
        if (bounds === null) return null

        const definition = runtime.registry.get(toType)
        if (definition === undefined) return null
        const size = definition.create().frame

        /*
         * Beside the cluster, not on it: placing it over the evidence would
         * hide what the claim is made of at the moment the claim is made. Above
         * when that is free, and somewhere already on screen when it can be —
         * `placeDerived` says which.
         */
        const occupied = [...doc.objects.values()].flatMap((object) => {
          const capabilities = runtime.registry.get(object.type)?.capabilities
          if (capabilities?.spatial === false) return []
          return [
            {
              ...runtime.registry.boundsOf(object, doc),
              // A frame the cluster sits in is not in the way of what goes beside it.
              container: capabilities?.canHaveChildren === true,
            },
          ]
        })
        const { viewport, canvasSize } = store
        const view = {
          x: viewport.x,
          y: viewport.y,
          width: canvasSize.width / viewport.zoom,
          height: canvasSize.height / viewport.zoom,
        }
        const at = placeDerived(
          bounds,
          size,
          occupied,
          view,
          SYNTHESIS_GAP,
          store.snapToGrid ? snapPoint : undefined,
        )

        // Minted here so the new object can be revealed and edited once it exists.
        const derivedId = runtime.ids.objectId()
        const result = dispatcher.dispatch({
          kind: 'DeriveObject',
          toType,
          from: cited.map((object) => object.id),
          predicate,
          x: at.x,
          y: at.y,
          id: derivedId,
        })
        report(result)
        if (!result.ok) return null
        /*
         * Revealed, not merely selected. The insight is placed ABOVE the
         * cluster, which on a cluster near the top of the window puts it off
         * screen — synthesis would produce a card the user never sees, with a
         * panel describing it as if it were in front of them.
         */
        revealObject(derivedId)
        /*
         * Straight into editing. A derived object is an empty card that exists
         * only to hold something nobody has written yet — leaving the user to
         * find it and double-click is asking them to do the obvious next step
         * by hand, and an unwritten claim citing real evidence is the worst
         * thing this board can contain.
         */
        useInteractionStore.getState().setEditing(derivedId)
        return derivedId
      },

      ungroup() {
        const ids = selected()
        if (ids.length === 0) return
        /*
         * What is freed is what the groups HELD, read before they go. Not what
         * the command touched: deleting a group also detaches any line joined
         * to it, and selecting that line with the members would hand the next
         * restyle or delete an object nobody chose.
         */
        const doc = runtime.store.getDocument()
        const children = groupByParent(doc)
        const freed = ids
          .filter((id) => {
            const type = doc.objects.get(id)?.type
            return type !== undefined && runtime.registry.get(type)?.capabilities.selectsAsUnit
          })
          .flatMap((id) => (children.get(id) ?? []).map((object) => object.id))
        const result = dispatcher.dispatch({ kind: 'UngroupObjects', ids })
        report(result)
        if (result.ok) useInteractionStore.getState().setSelection(freed)
      },

      duplicateSelection() {
        const ids = selected()
        if (ids.length === 0) return
        const result = dispatcher.dispatch({
          kind: 'DuplicateObjects',
          ids,
          dx: DUPLICATE_OFFSET,
          dy: DUPLICATE_OFFSET,
        })
        report(result)
        if (result.ok) useInteractionStore.getState().setSelection(result.affected)
      },

      copySelection() {
        const document = runtime.store.getDocument()
        const objects = [...useInteractionStore.getState().selection]
          .map((id) => document.objects.get(id))
          .filter((object) => object !== undefined)
        if (objects.length > 0) useInteractionStore.getState().setClipboard(objects)
      },

      cutSelection() {
        this.copySelection()
        this.deleteSelection()
      },

      paste(at) {
        const store = useInteractionStore.getState()
        const clipboard = store.clipboard
        if (clipboard.length === 0) return

        const origin = pasteOrigin(clipboard, runtime.registry, runtime.store.getDocument())
        // Paste at the pointer when there is one, otherwise offset from the
        // source so the copy is visibly a copy rather than hidden underneath.
        const offsetX = at === undefined ? DUPLICATE_OFFSET : at.x - origin.x
        const offsetY = at === undefined ? DUPLICATE_OFFSET : at.y - origin.y

        const result = dispatcher.dispatch({
          kind: 'CreateObjects',
          // The clipboard may hold objects the board no longer has, so these are
          // made from the copies rather than duplicated by id.
          objects: clipboard.map((object) => copySpec(object, offsetX, offsetY)),
        })
        report(result)
        if (result.ok) store.setSelection(result.affected)
      },

      selectAll() {
        const ids = [...runtime.store.getDocument().objects.values()]
          .filter((object) => !object.hidden && !object.locked)
          .map((object) => object.id)
        useInteractionStore.getState().setSelection(ids)
      },

      setBoardTitle(title) {
        const result = dispatcher.dispatch({ kind: 'SetBoardTitle', title })
        // Reported to the caller rather than only to the toast: the input has
        // to decide whether to keep the text somebody typed or put the old
        // name back, and it cannot learn that from a notice.
        report(result)
        if (!result.ok) return false

        /*
         * And in the board list, which reads a COPY of this name from the
         * database. Fire and forget: the document is renamed either way, the
         * database refuses anyone but the owner, and a board list showing a
         * stale name is not worth failing a rename over.
         */
        void remoteBoards.rename(runtime.boardId, runtime.store.getDocument().meta.title)
        return true
      },

      moveObjects(moves) {
        if (moves.length === 0) return
        report(dispatcher.dispatch({ kind: 'MoveObjects', moves }))
      },

      moveAndReparent(moves, parentId) {
        if (moves.length === 0) return
        const ids = moves.map((move) => move.id)
        report(
          dispatcher.transact(parentId === null ? 'Move out of frame' : 'Move into frame', [
            { kind: 'MoveObjects', moves },
            { kind: 'ReparentObjects', ids, parentId },
          ]),
        )
      },

      resizeObjects(resizes) {
        if (resizes.length === 0) return
        report(dispatcher.dispatch({ kind: 'ResizeObjects', resizes }))
      },

      rotateObjects(rotations) {
        if (rotations.length === 0) return
        report(dispatcher.dispatch({ kind: 'RotateObjects', rotations }))
      },

      reorder(placement) {
        const ids = [...useInteractionStore.getState().selection]
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'ReorderObjects', ids, placement }))
      },

      setLocked(locked) {
        const ids = [...useInteractionStore.getState().selection]
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'SetLocked', ids, locked }))
      },

      setHidden(hidden) {
        const ids = [...useInteractionStore.getState().selection]
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'SetHidden', ids, hidden }))
        // A hidden object cannot be clicked, so leaving it selected strands the
        // selection on something invisible.
        if (hidden) useInteractionStore.getState().clearSelection()
      },

      deleteSelection() {
        const ids = [...useInteractionStore.getState().selection]
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'DeleteObjects', ids }))
        useInteractionStore.getState().clearSelection()
      },

      updateData(id, patch) {
        report(dispatcher.dispatch({ kind: 'UpdateObjectData', id, patch }))
      },

      updateDataAndSize(id, patch, frame) {
        report(
          dispatcher.transact('Edit', [
            { kind: 'UpdateObjectData', id, patch },
            { kind: 'ResizeObjects', resizes: [{ id, frame }] },
          ]),
        )
      },

      resizeDivider(id, patch, frame) {
        report(
          dispatcher.transact('Resize track', [
            { kind: 'UpdateObjectData', id, patch },
            { kind: 'ResizeObjects', resizes: [{ id, frame }] },
          ]),
        )
      },

      /**
       * A crop: the window that is shown AND the box showing it, as one
       * undoable action.
       *
       * The same shape as a divider drag and for the same reason — they are
       * two different kinds of change, data and geometry, that only mean
       * something together. `transact` is what makes the pair one step to
       * undo, which rule 4 is about: one ACTION per gesture, not one command.
       */
      cropImage(id, crop, frame) {
        report(
          dispatcher.transact('Crop image', [
            { kind: 'UpdateObjectData', id, patch: { crop } },
            { kind: 'ResizeObjects', resizes: [{ id, frame }] },
          ]),
        )
      },

      uncropImage(id) {
        const object = runtime.store.getDocument().objects.get(id)
        if (object === undefined) return
        const window = runtime.registry.cropWindowOf(object)
        if (window === null) return

        /*
         * The frame grows BACK. Restoring the window alone would squeeze the
         * whole picture into the cropped box, which looks like the image was
         * rescaled rather than uncropped.
         */
        const restored = uncrop(object.frame, window)
        report(
          dispatcher.transact('Reset crop', [
            { kind: 'UpdateObjectData', id, patch: { crop: null } },
            {
              kind: 'ResizeObjects',
              resizes: [{ id, frame: { ...object.frame, ...restored.frame } }],
            },
          ]),
        )
      },

      promoteSelection(toType) {
        const ids = [...useInteractionStore.getState().selection]
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'ConvertObjects', ids, toType }))
      },

      retargetEndpoint(id, endpointId, target) {
        const object = runtime.store.getDocument().objects.get(id)
        if (object === undefined) return

        /*
         * The type turns "this end was dropped there" into a data patch. The
         * gesture reports only what was under the pointer; which anchor to use,
         * and whether the drop is allowed at all, are the type's business.
         */
        const patch = runtime.registry.retargetEndpoint(
          object,
          runtime.store.getDocument(),
          endpointId,
          target,
        )
        if (patch === null || Object.keys(patch).length === 0) return

        report(dispatcher.dispatch({ kind: 'UpdateObjectData', id, patch }))
      },

      setColor(ids, color) {
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'UpdateStyle', ids: [...ids], style: { color } }))
      },

      setStyle(ids, style) {
        if (ids.length === 0 || Object.keys(style).length === 0) return
        report(dispatcher.dispatch({ kind: 'UpdateStyle', ids: [...ids], style }))
      },

      undo() {
        sayWhyNot(dispatcher.undo())
        useInteractionStore
          .getState()
          .pruneSelection((id) => runtime.store.getObject(id) !== undefined)
      },

      redo() {
        sayWhyNot(dispatcher.redo())
        useInteractionStore
          .getState()
          .pruneSelection((id) => runtime.store.getObject(id) !== undefined)
      },

      revertChange(change) {
        const result = dispatcher.revert(change)
        if (!result.ok) {
          sayWhyNot(result)
          return null
        }
        // Said to every peer, so the change reads as taken back everywhere and
        // nobody reverts it twice.
        collaboration?.markReverted(change.id, guestIdentity().name)
        const store = useInteractionStore.getState()
        store.pruneSelection((id) => runtime.store.getObject(id) !== undefined)
        /*
         * Said, not left to be noticed: what stayed because somebody had
         * changed it since is exactly the part a person would otherwise go
         * looking for.
         */
        const kept = change.affected.length - result.affected.length
        store.announce(
          kept === 0
            ? `Reverted “${change.label}”.`
            : `Reverted “${change.label}”, except ${String(kept)} ${kept === 1 ? 'object' : 'objects'} changed since.`,
        )
        return result.transactionId
      },
    }
  }, [dispatcher, runtime, collaboration, remoteBoards])
}
