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
        borderColor: inkColor(object.style.strokeColor),
        /*
         * A HAIRLINE at every zoom, and a 2px corner at every zoom.
         *
         * The box is drawn in world space, so a 1px border is 4px of ink at
         * 400% and the 2px corner becomes an 8px curve — at which point a
         * frame stops reading as a ruled boundary and starts reading as a
         * rounded card, which is the shape this world refuses. Dividing by the
         * zoom is the same counter-scale the title gets, expressed in the two
         * properties a transform cannot reach without scaling the contents.
         */
        borderWidth: `${String(1 / zoom)}px`,
        borderRadius: `${String(2 / zoom)}px`,
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      aria-label={`Frame: ${object.data.name}`}
    >
      <div
        className="of-frame__title"
        style={{
          /*
           * Counter-scaling keeps the title legible at 25% and unobtrusive at
           * 400%, the way frame labels behave in every tool users come from.
           *
           * The height and offset are PLAIN, not divided by the zoom. The
           * world is already scaled by `zoom` and this element by `1 / zoom`,
           * so the two cancel and a CSS pixel here is a screen pixel — a
           * second division applied it twice, and the band the title is drawn
           * in halved with every doubling: 18px at 100%, 9 at 200%, 4.5 at
           * 400%, clipping 15px text to nothing. Zooming IN made the name
           * disappear.
           *
           * `top` is the negative of the height so the band's bottom edge
           * lands on the frame's top edge, which is where `transformOrigin`
           * pins it.
           */
          transform: `scale(${String(1 / zoom)})`,
          transformOrigin: '0 100%',
          top: `${String(-TITLE_PX)}px`,
          height: `${String(TITLE_PX)}px`,
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
        borderColor: inkColor(object.style.strokeColor),
        /*
         * A HAIRLINE at every zoom, and a 2px corner at every zoom.
         *
         * The box is drawn in world space, so a 1px border is 4px of ink at
         * 400% and the 2px corner becomes an 8px curve — at which point a
         * frame stops reading as a ruled boundary and starts reading as a
         * rounded card, which is the shape this world refuses. Dividing by the
         * zoom is the same counter-scale the title gets, expressed in the two
         * properties a transform cannot reach without scaling the contents.
         */
        borderWidth: `${String(1 / zoom)}px`,
        borderRadius: `${String(2 / zoom)}px`,
        opacity: object.style.opacity ?? 1,
      }}
    >
      <InlineTextEditor
        initialText={object.data.name}
        className="of-frame__title of-frame__editor"
        style={{
          transform: `scale(${String(1 / zoom)})`,
          transformOrigin: '0 100%',
          top: `${String(-TITLE_PX)}px`,
          height: `${String(TITLE_PX)}px`,
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
