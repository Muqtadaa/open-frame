import type { ObjectId } from '@openframe/core'
import { memo } from 'react'

import { useDocumentObject } from '../hooks/use-document-object.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
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
  const preview = useInteractionStore((state) =>
    state.drag.kind === 'resize' || state.drag.kind === 'rotate'
      ? state.drag.frames.get(id)
      : undefined,
  )
  const commands = useCommands()

  if (object === undefined) return null

  const view = views.get(object.type)
  const Renderer = view?.Renderer ?? FallbackView
  const InlineEditor = view?.InlineEditor

  const frame = preview ?? object.frame
  const x = frame.x + (isDragging ? dragDx : 0)
  const y = frame.y + (isDragging ? dragDy : 0)

  return (
    <div
      className={`of-object${selected ? ' of-object--selected' : ''}`}
      data-object-id={id}
      data-object-type={object.type}
      data-testid={`object-${id}`}
      style={{
        transform: `translate(${String(x)}px, ${String(y)}px) rotate(${String(frame.rotation)}rad)`,
        width: `${String(frame.width)}px`,
        height: `${String(frame.height)}px`,
      }}
    >
      <ObjectErrorBoundary objectId={id} objectType={object.type}>
        {editing && InlineEditor !== undefined ? (
          <InlineEditor
            object={object}
            zoom={zoom}
            onCommit={(patch) => {
              // Types name their editable field differently (`text`, `name`),
              // so the patch is passed through rather than picked apart here.
              commands.updateData(id, patch)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Renderer object={object} selected={selected} zoom={zoom} />
        )}
      </ObjectErrorBoundary>
    </div>
  )
}

export const ObjectView = memo(ObjectViewInner)
