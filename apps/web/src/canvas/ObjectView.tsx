import type { AnyOpenFrameObject, ObjectId } from '@openframe/core'
import { memo, useCallback, useMemo } from 'react'

import { useAssetUrl } from '../hooks/use-asset-url.js'
import { useDependencySubscriptions, useDocumentObject } from '../hooks/use-document-object.js'
import { useCommands } from '../hooks/use-commands.js'
import { useOpenFrame } from '../runtime/context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useRemoteDrag } from '../interaction/remote-drags.js'
import { ObjectErrorBoundary } from './ObjectErrorBoundary.js'
import { EditorChrome } from './EditorChrome.js'
import { FallbackView } from '../views/FallbackView.js'
import type { ObjectEditorProps, ObjectViewRegistry } from '../views/registry.js'

interface Props {
  readonly id: ObjectId
  readonly views: ObjectViewRegistry
}

/**
 * One object on the canvas.
 *
 * Subscribes to exactly its own object, so moving one note re-renders one
 * component. The live drag delta is added HERE at render time — the document
 * still holds the committed position, and will until pointer-up.
 */
/**
 * The chrome component handed to this object's editor.
 *
 * MEMOISED on the id, and that is not an optimisation. Written inline it was a
 * new component TYPE on every render, so React unmounted and remounted the
 * portal each time — the apparatus flickered out of existence mid-interaction
 * and took the focus with it, which presented as buttons that were visible and
 * could not be clicked.
 */
function useChrome(id: ObjectId): ObjectEditorProps['Chrome'] {
  return useMemo(
    () =>
      function ObjectChrome({ anchor, prefer, children }) {
        return (
          <EditorChrome objectId={id} anchor={anchor} prefer={prefer}>
            {children}
          </EditorChrome>
        )
      },
    [id],
  )
}

function ObjectViewInner({ id, views }: Props) {
  const chrome = useChrome(id)
  const object = useDocumentObject(id)
  const selected = useInteractionStore((state) => state.selection.has(id))
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  // Subscribes to the objects this one's rendering depends on — a connector's
  // endpoints — so it redraws when they move. Without this, per-object
  // subscriptions would leave dependent objects stale.
  useDependencySubscriptions(id)
  const editing = useInteractionStore((state) => state.editingId === id)
  /*
   * Two primitive selectors rather than one returning the point: a fresh
   * `{ x, y }` never compares equal under `Object.is`, and every object on the
   * board subscribes to this. Rule 9, which crashed the app once.
   */
  const editingX = useInteractionStore((state) => state.editingAt?.x ?? null)
  const editingY = useInteractionStore((state) => state.editingAt?.y ?? null)
  const editingAt = editingX === null || editingY === null ? null : { x: editingX, y: editingY }
  const setEditing = useInteractionStore((state) => state.setEditing)
  /*
   * Three PRIMITIVE selectors, not one that builds an object.
   *
   * A selector returning a fresh `{ dx, dy }` each call never compares equal to
   * its previous result, so `useSyncExternalStore` re-renders forever. Zustand
   * compares with `Object.is`; only primitives (or stable references) are safe.
   */
  const isDragging = useInteractionStore(
    (state) => state.drag.kind === 'translate' && state.drag.ids.has(id),
  )
  const dragDx = useInteractionStore((state) =>
    state.drag.kind === 'translate' ? state.drag.dx : 0,
  )
  const dragDy = useInteractionStore((state) =>
    state.drag.kind === 'translate' ? state.drag.dy : 0,
  )
  // `Map.get` returns a stable reference while the map is unchanged, so this is
  // a safe selector despite looking like it constructs something.
  /*
   * Somebody else's hand on this object. Rule 4 means nothing has been written
   * yet, so without this the object sits still and then teleports when they
   * let go.
   */
  const remoteDrag = useRemoteDrag(id)
  const preview = useInteractionStore((state) =>
    state.drag.kind === 'resize' || state.drag.kind === 'rotate'
      ? state.drag.frames.get(id)
      : undefined,
  )
  /*
   * A divider being dragged previews as DATA rather than as a frame — moving a
   * table's column boundary changes its weights, not its box. Nothing is
   * written to the document until the pointer comes up, so this is the only
   * thing that makes the drag visible.
   *
   * A stable reference from the store, so it is safe in a selector: the state
   * holds the same object between updates.
   */
  const dividerPreview = useInteractionStore((state) =>
    state.drag.kind === 'divider' && state.drag.objectId === id ? state.drag.data : null,
  )
  /*
   * Primitives, not the object: rule 9. A fresh `{ width, height }` from a
   * selector never compares equal and re-renders forever.
   */
  const growWidth = useInteractionStore((state) =>
    state.drag.kind === 'divider' && state.drag.objectId === id ? state.drag.grow.width : 0,
  )
  const growHeight = useInteractionStore((state) =>
    state.drag.kind === 'divider' && state.drag.objectId === id ? state.drag.grow.height : 0,
  )
  /*
   * A crop previews as DATA and a FRAME together — the window shrinks and the
   * box shrinks with it, which is what keeps the surviving pixels still under
   * the pointer. Primitives, not the frame object: rule 9.
   */
  const cropPreview = useInteractionStore((state) =>
    state.drag.kind === 'crop' && state.drag.objectId === id ? state.drag.crop : null,
  )
  const cropX = useInteractionStore((state) =>
    state.drag.kind === 'crop' && state.drag.objectId === id ? (state.drag.frame?.x ?? null) : null,
  )
  const cropY = useInteractionStore((state) =>
    state.drag.kind === 'crop' && state.drag.objectId === id ? (state.drag.frame?.y ?? null) : null,
  )
  const cropWidth = useInteractionStore((state) =>
    state.drag.kind === 'crop' && state.drag.objectId === id
      ? (state.drag.frame?.width ?? null)
      : null,
  )
  const cropHeight = useInteractionStore((state) =>
    state.drag.kind === 'crop' && state.drag.objectId === id
      ? (state.drag.frame?.height ?? null)
      : null,
  )
  const commands = useCommands()
  const { runtime } = useOpenFrame()
  // Resolved before the early return so hook order never varies. Only views
  // that declare `usesAssets` actually subscribe.
  const assetUrl = useAssetUrl(
    object !== undefined && views.get(object.type)?.usesAssets === true,
  )
  /*
   * WHERE ANOTHER OBJECT'S EDGES ARE, for the one view that draws against
   * them. Handed down rather than reached for: views are a leaf module with no
   * registry, and `other.frame` is wrong for anything with a derived extent —
   * a group's frame is 0x0 and its children are the truth.
   */
  const boundsOf = useCallback(
    (other: AnyOpenFrameObject) => runtime.registry.boundsOf(other, runtime.store.getDocument()),
    [runtime],
  )

  if (object === undefined) return null

  const view = views.get(object.type)
  const Renderer = view?.Renderer ?? FallbackView
  const InlineEditor = view?.InlineEditor

  /*
   * The frame a resize gesture is previewing, or the object's own — grown by
   * whatever a divider drag is asking for. Both are previews of the same
   * thing, and the wrapper has to carry the growth or the cells redistribute
   * inside a box that never changes size.
   */
  const cropped =
    cropX === null || cropY === null || cropWidth === null || cropHeight === null
      ? null
      : { x: cropX, y: cropY, width: cropWidth, height: cropHeight }
  const shown = cropped === null ? (preview ?? object.frame) : { ...object.frame, ...cropped }
  const frame =
    growWidth === 0 && growHeight === 0
      ? shown
      : { ...shown, width: shown.width + growWidth, height: shown.height + growHeight }
  /*
   * A connector's geometry is its resolved endpoints, in absolute world
   * coordinates — it has no frame to be positioned by. Anchoring its wrapper at
   * the origin lets the view draw where it actually belongs.
   */
  const selfPositioned = object.type === 'connector'
  /*
   * A selected object is lifted above its unselected siblings so the selection
   * reads clearly — but a CONTAINER lifted above the board is lifted above its
   * own contents, and a frame with a solid fill then paints over everything
   * inside it the moment it is clicked. Asked of the registry rather than
   * compared against 'frame', so any later container type is right for free.
   */
  const holdsChildren =
    runtime.registry.get(object.type)?.capabilities.canHaveChildren === true
  /*
   * Your own drag wins over somebody else's.
   *
   * Both at once means two people have hold of the same object, which the
   * advisory lock discourages and nothing prevents. Drawing it under YOUR
   * pointer is the honest choice: the thing you are moving must follow your
   * hand, and the commit that follows is decided by the document rather than
   * by what either of you was shown.
   */
  const offset = isDragging ? { dx: dragDx, dy: dragDy } : (remoteDrag ?? { dx: 0, dy: 0 })
  const x = frame.x + offset.dx
  const y = frame.y + offset.dy

  return (
    <div
      className={`of-object${selected && !holdsChildren ? ' of-object--selected' : ''}${
        selfPositioned ? ' of-object--self-positioned' : ''
      }${object.locked ? ' of-object--locked' : ''}`}
      data-object-id={id}
      data-object-type={object.type}
      data-testid={`object-${id}`}
      style={{
        transform: selfPositioned
          ? undefined
          : `translate(${String(x)}px, ${String(y)}px) rotate(${String(frame.rotation)}rad)`,
        width: selfPositioned ? undefined : `${String(frame.width)}px`,
        height: selfPositioned ? undefined : `${String(frame.height)}px`,
      }}
    >
      <ObjectErrorBoundary objectId={id} objectType={object.type}>
        {editing && InlineEditor !== undefined ? (
          <InlineEditor
            object={object}
            zoom={zoom}
            document={runtime.store.getDocument()}
            boundsOf={boundsOf}
            at={editingAt}
            Chrome={chrome}
            onCommit={(patch) => {
              // Types name their editable field differently (`text`, `name`),
              // so the patch is passed through rather than picked apart here.
              commands.updateData(id, patch)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Renderer
            /*
             * Merged, not mutated: the document still holds the committed
             * data, and this is what the object WOULD become if the pointer
             * came up now. Rule 4 in one expression.
             */
            object={
              cropPreview !== null
                ? { ...object, data: { ...(object.data as object), crop: cropPreview }, frame }
                : dividerPreview === null
                ? object
                : {
                    ...object,
                    data: { ...(object.data as object), ...dividerPreview },
                    /*
                     * The FRAME previews too. Resizing one track takes space
                     * from nowhere, so the object grows — without this the
                     * cells redistribute inside a box that is not changing and
                     * the drag looks like it has hit a limit.
                     */
                    frame,
                  }
            }
            selected={selected}
            zoom={zoom}
            document={runtime.store.getDocument()}
            assetUrl={assetUrl}
            boundsOf={boundsOf}
          />
        )}
      </ObjectErrorBoundary>
    </div>
  )
}

export const ObjectView = memo(ObjectViewInner)
