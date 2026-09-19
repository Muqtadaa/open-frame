import type { ObjectId } from '@openframe/core'
import { memo } from 'react'

import { useAssetUrl } from '../hooks/use-asset-url.js'
import { useDependencySubscriptions, useDocumentObject } from '../hooks/use-document-object.js'
import { useCommands } from '../hooks/use-commands.js'
import { useOpenFrame } from '../runtime/context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useRemoteDrag } from '../interaction/remote-drags.js'
import { ObjectErrorBoundary } from './ObjectErrorBoundary.js'
import { FallbackView } from '../views/FallbackView.js'
import type { ObjectViewRegistry } from '../views/registry.js'

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
function ObjectViewInner({ id, views }: Props) {
  const object = useDocumentObject(id)
  const selected = useInteractionStore((state) => state.selection.has(id))
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  // Subscribes to the objects this one's rendering depends on — a connector's
  // endpoints — so it redraws when they move. Without this, per-object
  // subscriptions would leave dependent objects stale.
  useDependencySubscriptions(id)
  const editing = useInteractionStore((state) => state.editingId === id)
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
  const commands = useCommands()
  const { runtime } = useOpenFrame()
  // Resolved before the early return so hook order never varies. Only views
  // that declare `usesAssets` actually subscribe.
  const assetUrl = useAssetUrl(
    object !== undefined && views.get(object.type)?.usesAssets === true,
  )

  if (object === undefined) return null

  const view = views.get(object.type)
  const Renderer = view?.Renderer ?? FallbackView
  const InlineEditor = view?.InlineEditor

  const frame = preview ?? object.frame
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
      }`}
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
            object={object}
            selected={selected}
            zoom={zoom}
            document={runtime.store.getDocument()}
            assetUrl={assetUrl}
          />
        )}
      </ObjectErrorBoundary>
    </div>
  )
}

export const ObjectView = memo(ObjectViewInner)
