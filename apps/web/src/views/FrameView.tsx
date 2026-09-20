import type { FrameData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'
import { inkColor, surfaceOf } from '../scene/style-tokens.js'

/** Title height in SCREEN pixels, counter-scaled so it never shrinks with the board. */
const TITLE_PX = 18

function FrameRenderer({ object, zoom }: ObjectViewProps<FrameData>) {
  const filled = (object.style.fill ?? 'solid') !== 'none'
  return (
    <div
      className="of-frame"
      style={{
        background: filled ? surfaceOf(object.style.color, 'gray') : 'transparent',
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      aria-label={`Frame: ${object.data.name}`}
    >
      <div
        className="of-frame__title"
        style={{
          // Counter-scaling keeps the title legible at 25% and unobtrusive at
          // 400%, the way frame labels behave in every tool users come from.
          transform: `scale(${String(1 / zoom)})`,
          transformOrigin: '0 100%',
          top: `${String(-TITLE_PX / zoom)}px`,
          height: `${String(TITLE_PX / zoom)}px`,
          color: inkColor(object.style.textColor),
        }}
      >
        {object.data.name}
      </div>
    </div>
  )
}

function FrameEditor({ object, zoom, onCommit, onCancel }: ObjectEditorProps<FrameData>) {
  const filled = (object.style.fill ?? 'solid') !== 'none'
  return (
    /*
     * The frame is drawn while it is being named, exactly as it will look
     * afterwards.
     *
     * A newly placed frame opens its title editor immediately, and this editor
     * used to force a transparent background — so for as long as the user was
     * typing a name, the frame was a hairline outline on a ruled page and read
     * as nothing having been created at all. Naming is a label being written on
     * something that already exists, not a condition of its existing.
     */
    <div
      className="of-frame"
      style={{
        background: filled ? surfaceOf(object.style.color, 'gray') : 'transparent',
        opacity: object.style.opacity ?? 1,
      }}
    >
      <InlineTextEditor
        initialText={object.data.name}
        className="of-frame__title of-frame__editor"
        style={{
          transform: `scale(${String(1 / zoom)})`,
          transformOrigin: '0 100%',
          top: `${String(-TITLE_PX / zoom)}px`,
          height: `${String(TITLE_PX / zoom)}px`,
          color: inkColor(object.style.textColor),
        }}
        ariaLabel="Rename frame"
        onCommit={(name) => onCommit({ name })}
        onCancel={onCancel}
      />
    </div>
  )
}

export const frameView = defineObjectView<FrameData>({
  type: 'frame',
  Renderer: FrameRenderer,
  InlineEditor: FrameEditor,
})
