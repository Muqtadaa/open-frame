import type { FrameData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'
import { SURFACE_VARS } from '../scene/style-tokens.js'

/** Title height in SCREEN pixels, counter-scaled so it never shrinks with the board. */
const TITLE_PX = 18

function FrameRenderer({ object, zoom }: ObjectViewProps<FrameData>) {
  const filled = (object.style.fill ?? 'solid') !== 'none'
  return (
    <div
      className="of-frame"
      style={{
        background: filled ? SURFACE_VARS[object.style.color ?? 'gray'] : 'transparent',
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
        }}
      >
        {object.data.name}
      </div>
    </div>
  )
}

function FrameEditor({ object, zoom, onCommit, onCancel }: ObjectEditorProps<FrameData>) {
  return (
    <div className="of-frame" style={{ background: 'transparent' }}>
      <InlineTextEditor
        initialText={object.data.name}
        className="of-frame__title of-frame__editor"
        style={{
          transform: `scale(${String(1 / zoom)})`,
          transformOrigin: '0 100%',
          top: `${String(-TITLE_PX / zoom)}px`,
          height: `${String(TITLE_PX / zoom)}px`,
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
