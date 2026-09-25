import { useMemo } from 'react'
import { unionAll, type AlignEdge, type DistributeAxis, type Rect } from '@openframe/core'

import { useCommands } from '../hooks/use-commands.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { ChromeSurface } from './EditorChrome.js'
import { optionsPanelRect } from './options-panel.js'
import {
  AlignBottomIcon,
  AlignCenterXIcon,
  AlignLeftIcon,
  AlignMiddleYIcon,
  AlignRightIcon,
  AlignTopIcon,
  DistributeXIcon,
  DistributeYIcon,
} from '../controls/icons.js'

/** The six edges, in the order every tool that has this puts them. */
const ALIGNMENTS: readonly {
  readonly edge: AlignEdge
  readonly label: string
  readonly Icon: typeof AlignLeftIcon
}[] = [
  { edge: 'left', label: 'Align left', Icon: AlignLeftIcon },
  { edge: 'centerX', label: 'Align centres', Icon: AlignCenterXIcon },
  { edge: 'right', label: 'Align right', Icon: AlignRightIcon },
  { edge: 'top', label: 'Align top', Icon: AlignTopIcon },
  { edge: 'middleY', label: 'Align middles', Icon: AlignMiddleYIcon },
  { edge: 'bottom', label: 'Align bottom', Icon: AlignBottomIcon },
]

const DISTRIBUTIONS: readonly {
  readonly axis: DistributeAxis
  readonly label: string
  readonly Icon: typeof DistributeXIcon
}[] = [
  { axis: 'x', label: 'Distribute horizontally', Icon: DistributeXIcon },
  { axis: 'y', label: 'Distribute vertically', Icon: DistributeYIcon },
]

/**
 * Align and distribute, floating above whatever is selected.
 *
 * On the CHROME LAYER, through the same surface a type's own apparatus uses,
 * so it is placed in screen space, sized independently of the zoom and clamped
 * inside the window. Anchored to the selection rather than to an object,
 * because a selection is what this acts on — which is why that surface takes a
 * rectangle rather than an id.
 *
 * Only for two or more. One object has nothing to line up with, and a bar that
 * appears for every selection and does nothing for most of them is a bar
 * people learn to ignore.
 */
export function ArrangeBar() {
  const { runtime } = useOpenFrame()
  const commands = useCommands()
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)

  /*
   * What the bar acts on, and what it anchors to, decided ONCE.
   *
   * The same two exclusions the command makes, for the same reasons: a type
   * whose shape is its ends has no position to line up, and a locked object
   * cannot be moved. Counting them here would light up controls that then do
   * nothing — and `distribute` in particular must be disabled on exactly the
   * selections it would refuse.
   */
  const arrangeable = useMemo(() => {
    const objects = [...selection]
      .map((id) => document.objects.get(id))
      .filter((object) => object !== undefined)
      .filter((object) => runtime.registry.get(object.type)?.capabilities.spatial === true)
      .filter((object) => runtime.registry.endpointsOf(object, document).length === 0)

    return {
      count: objects.length,
      movable: objects.filter((object) => !object.locked).length,
      bounds: unionAll(objects.map((object) => runtime.registry.boundsOf(object, document))),
    }
  }, [selection, document, runtime.registry])

  // Hidden while the selection is being made or moved, and while typing: a bar
  // over the thing you are dragging is a bar under your pointer.
  if (dragKind !== 'idle' || editingId !== null) return null
  if (arrangeable.count < 2 || arrangeable.movable === 0) return null

  const bounds: Rect | null = arrangeable.bounds
  const canDistribute = arrangeable.count >= 3

  // The other thing that floats beside a selection, and the one this layer
  // cannot place — so it is told where it is.
  const panel = optionsPanelRect()

  return (
    <ChromeSurface
      bounds={bounds}
      prefer={['above', 'below', 'right', 'left']}
      testId="arrange-bar"
      avoid={panel}
    >
      <div className="of-arrange of-surface" role="group" aria-label="Arrange selection">
        {ALIGNMENTS.map(({ edge, label, Icon }) => (
          <button
            key={edge}
            type="button"
            className="of-icon-button"
            data-tip={label}
            aria-label={label}
            data-testid={`align-${edge}`}
            onClick={() => {
              commands.align(edge)
            }}
          >
            <Icon className="of-arrange__glyph" />
          </button>
        ))}

        <span className="of-arrange__rule" aria-hidden="true" />

        {DISTRIBUTIONS.map(({ axis, label, Icon }) => (
          <button
            key={axis}
            type="button"
            className="of-icon-button"
            /*
             * DISABLED below three, not hidden. Two objects have no space
             * between the ends to even out, and a control that disappears as
             * the selection changes size reads as a glitch — the same call the
             * code box's format button makes.
             */
            disabled={!canDistribute}
            data-tip={canDistribute ? label : `${label} (needs three or more)`}
            aria-description={canDistribute ? label : `${label} (needs three or more)`}
            aria-label={label}
            data-testid={`distribute-${axis}`}
            onClick={() => {
              commands.distribute(axis)
            }}
          >
            <Icon className="of-arrange__glyph" />
          </button>
        ))}
      </div>
    </ChromeSurface>
  )
}
