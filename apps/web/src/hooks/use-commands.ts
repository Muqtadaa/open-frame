import type {
  ColorToken,
  Command,
  ObjectStyle,
  ConnectorEndpoint,
  EndpointTarget,
  ObjectFrame,
  ObjectId,
  Placement,
  Point,
  Rect,
} from '@openframe/core'
import {
  alignOffsets,
  childrenOf,
  distributeOffsets,
  uncrop,
  unionAll,
  type AlignEdge,
  type DistributeAxis,
  type ImageCrop,
} from '@openframe/core'
import { useMemo } from 'react'

import { renameRemoteBoard } from '../app/remote-boards.js'

/** What the undo entry says, which is the only place these names show up. */
const ALIGN_LABELS: Readonly<Record<AlignEdge, string>> = {
  left: 'Align left',
  centerX: 'Align centres',
  right: 'Align right',
  top: 'Align top',
  middleY: 'Align middles',
  bottom: 'Align bottom',
}
import { useOpenFrame } from '../runtime/context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { objectsInMarquee } from '../scene/hit-testing.js'
import { snapPoint } from '../scene/snapping.js'
import { panToReveal } from '../scene/zoom.js'

export interface BoardCommands {
  /** Creates any registered type. No per-type method — that is the registry's job. */
  /** Creates a connector between two resolved endpoints. */
  createConnector(from: ConnectorEndpoint, to: ConnectorEndpoint): ObjectId | null
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
  /**
   * Lines the selection up on one edge of its own bounding box.
   *
   * Not a command of its own: it is a move, and `MoveObjects` already cascades
   * into a container's contents, which aligning a group needs. The dispatcher
   * takes an explicit label, so the undo entry still reads "Align left"
   * rather than "Move 5 objects".
   */
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
  resizeDivider(
    id: ObjectId,
    patch: Readonly<Record<string, unknown>>,
    frame: ObjectFrame,
  ): void
  updateData(id: ObjectId, patch: Readonly<Record<string, unknown>>): void
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

/** Top-left of a group of objects, used to anchor a paste. */
function framesOrigin(objects: readonly { frame: { x: number; y: number } }[]): Point {
  return {
    x: Math.min(...objects.map((o) => o.frame.x)),
    y: Math.min(...objects.map((o) => o.frame.y)),
  }
}

export function useCommands(): BoardCommands {
  const { runtime } = useOpenFrame()
  const dispatcher = runtime.dispatcher

  return useMemo<BoardCommands>(() => {
    const report = (result: { ok: boolean; error?: unknown }): void => {
      if (!result.ok) console.warn('[openframe] command rejected', result.error)
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

    /**
     * Applies an arrangement to the selection, as ONE move.
     *
     * The selection is turned into what the geometry needs — an id and the
     * extent it presents — and two kinds of object are held out of it:
     *
     * A type whose shape IS its ends, which is asked of the registry rather
     * than compared against 'connector'. A connector has no position of its
     * own; it is wherever the things it joins are, so moving it would be a
     * patch that changes nothing (rule 16) and counting it as a thing to line
     * up would be lining up a consequence.
     *
     * A locked object, because the command refuses those outright — but it
     * still counts toward the bounding box everything lines up on, since it is
     * visibly part of what was selected and aligning TO something pinned down
     * is a reasonable thing to want.
     */
    const arrange = (
      offsetsOf: (items: readonly { id: ObjectId; bounds: Rect }[]) => readonly {
        id: ObjectId
        dx: number
        dy: number
      }[],
      label: string,
    ): void => {
      const store = useInteractionStore.getState()
      const doc = runtime.store.getDocument()

      const selected = [...store.selection]
        .map((id) => doc.objects.get(id))
        .filter((object) => object !== undefined)
        .filter((object) => runtime.registry.get(object.type)?.capabilities.spatial === true)
        .filter((object) => runtime.registry.endpointsOf(object, doc).length === 0)

      const items = selected.map((object) => ({
        id: object.id,
        // From the REGISTRY: a rotated object's extent is not its frame, and
        // lining up frames would leave a rotated note visibly off the line.
        bounds: runtime.registry.boundsOf(object, doc),
      }))

      const movable = new Set(selected.filter((object) => !object.locked).map((o) => o.id))
      const moves = offsetsOf(items)
        .filter((offset) => movable.has(offset.id))
        .filter((offset) => offset.dx !== 0 || offset.dy !== 0)
      // Everything already where it belongs: nothing to do, and nothing that
      // should cost an undo step.
      if (moves.length === 0) return

      report(dispatcher.dispatch({ kind: 'MoveObjects', moves }, { label }))
    }

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

      createConnector(from, to) {
        const result = dispatcher.dispatch({
          kind: 'CreateObjects',
          objects: [
            {
              type: 'connector',
              // A connector's position comes from its endpoints; the frame is
              // vestigial and deliberately zero.
              x: 0,
              y: 0,
              data: { from, to },
            },
          ],
        })
        report(result)
        return result.ok ? (result.affected[0] ?? null) : null
      },

      align(edge) {
        arrange((items) => alignOffsets(items, edge), ALIGN_LABELS[edge])
      },
      distribute(axis) {
        arrange(
          (items) => distributeOffsets(items, axis),
          axis === 'x' ? 'Distribute horizontally' : 'Distribute vertically',
        )
      },
      group() {
        const store = useInteractionStore.getState()
        const doc = runtime.store.getDocument()
        const members = [...store.selection]
          .map((id) => doc.objects.get(id))
          .filter((object) => object !== undefined)

        // One object is already a unit, and nothing cannot be grouped.
        if (members.length < 2) return
        // Mixed parents would mean lifting objects out of their frames as a
        // side effect of grouping, which is not what was asked for.
        const parentId = members[0]?.parentId ?? null
        if (members.some((object) => (object.parentId ?? null) !== parentId)) return

        /*
         * The id is minted HERE because the second command has to name the
         * object the first one creates, and `transact` takes its commands
         * upfront. That is the whole reason `NewObjectSpec.id` exists.
         */
        const id = runtime.ids.objectId()
        const result = runtime.dispatcher.transact('Group', [
          {
            kind: 'CreateObjects',
            // A group has no frame of its own; its extent is its members'.
            objects: [{ type: 'group', id, x: 0, y: 0, parentId }],
          },
          { kind: 'ReparentObjects', ids: members.map((object) => object.id), parentId: id },
        ])
        report(result)
        if (result.ok) store.setSelection([id])
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
         * Above the cluster, centred on it, with a gap. Placing it on top of
         * the evidence would hide what the claim is made of at the moment the
         * claim is made — and the spatial relationship IS the explanation until
         * the user has read the panel.
         */
        const origin = {
          x: bounds.x + bounds.width / 2 - size.width / 2,
          y: bounds.y - size.height - SYNTHESIS_GAP,
        }
        const at = store.snapToGrid ? snapPoint(origin) : origin

        // Minted here because the relations must name the insight, and
        // `transact` takes its commands upfront — the grouping precedent.
        const derivedId = runtime.ids.objectId()
        const result = runtime.dispatcher.transact(`Derive ${toType}`, [
          {
            kind: 'CreateObjects',
            objects: [{ type: toType, id: derivedId, x: at.x, y: at.y }],
          },
          {
            kind: 'CreateObjects',
            /*
             * One relation per source object, all in the same transaction as
             * the new one. Split across transactions, an undo would leave an
             * insight standing on nothing — a claim whose provenance vanished,
             * which is the one thing this product must not do.
             *
             * Direction is new → selected: the new object is the one making the
             * claim, so it is the one that cites, derives from or tests.
             */
            objects: cited.map((object) => ({
              type: 'relation',
              x: 0,
              y: 0,
              data: { from: derivedId, to: object.id, predicate },
            })),
          },
        ])
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
        const store = useInteractionStore.getState()
        const doc = runtime.store.getDocument()
        const groups = [...store.selection]
          .map((id) => doc.objects.get(id))
          .filter((object) => object !== undefined)
          .filter(
            (object) => runtime.registry.get(object.type)?.capabilities.selectsAsUnit === true,
          )
        if (groups.length === 0) return

        const commands: Command[] = []
        const freed: ObjectId[] = []
        for (const group of groups) {
          const members = childrenOf(doc, group.id)
          if (members.length > 0) {
            commands.push({
              kind: 'ReparentObjects',
              ids: members.map((object) => object.id),
              parentId: group.parentId ?? null,
            })
            freed.push(...members.map((object) => object.id))
          }
        }
        /*
         * Members are lifted out BEFORE the group is deleted. The other order
         * would cascade the delete into its own contents — deleting a container
         * takes its children with it.
         */
        commands.push({ kind: 'DeleteObjects', ids: groups.map((object) => object.id) })

        const result = runtime.dispatcher.transact('Ungroup', commands)
        report(result)
        if (result.ok) store.setSelection(freed)
      },

      duplicateSelection() {
        const store = useInteractionStore.getState()
        const document = runtime.store.getDocument()
        const sources = [...store.selection]
          .map((id) => document.objects.get(id))
          .filter((object) => object !== undefined)
        if (sources.length === 0) return

        // Built from ordinary CreateObjects rather than a bespoke command: the
        // copy goes through the same validation and history as anything else.
        const result = dispatcher.dispatch({
          kind: 'CreateObjects',
          objects: sources.map((object) => ({
            type: object.type,
            x: object.frame.x + DUPLICATE_OFFSET,
            y: object.frame.y + DUPLICATE_OFFSET,
            width: object.frame.width,
            height: object.frame.height,
            style: object.style,
            data: { ...(object.data as Record<string, unknown>) },
          })),
        })
        report(result)
        if (result.ok) store.setSelection(result.affected)
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

        const origin = framesOrigin(clipboard)
        // Paste at the pointer when there is one, otherwise offset from the
        // source so the copy is visibly a copy rather than hidden underneath.
        const offsetX = at === undefined ? DUPLICATE_OFFSET : at.x - origin.x
        const offsetY = at === undefined ? DUPLICATE_OFFSET : at.y - origin.y

        const result = dispatcher.dispatch({
          kind: 'CreateObjects',
          objects: clipboard.map((object) => ({
            type: object.type,
            x: object.frame.x + offsetX,
            y: object.frame.y + offsetY,
            width: object.frame.width,
            height: object.frame.height,
            style: object.style,
            data: { ...(object.data as Record<string, unknown>) },
          })),
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
        void renameRemoteBoard(runtime.boardId, runtime.store.getDocument().meta.title)
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
        dispatcher.undo()
        useInteractionStore
          .getState()
          .pruneSelection((id) => runtime.store.getObject(id) !== undefined)
      },

      redo() {
        dispatcher.redo()
        useInteractionStore
          .getState()
          .pruneSelection((id) => runtime.store.getObject(id) !== undefined)
      },
    }
  }, [dispatcher, runtime])
}
