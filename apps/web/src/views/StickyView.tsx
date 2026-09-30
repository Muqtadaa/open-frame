import { isEmptyText, type ColorValue, type StickyData } from '@openframe/core'

import { StickyIcon } from '../controls/icons.js'
import {
  defineObjectView,
  type ObjectTool,
  type ObjectEditorProps,
  type ObjectViewProps,
} from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import {
  fontFamily,
  textAlign,
  verticalAlign,
  inkColor,
  readableInkOn,
  surfaceOf,
} from '../scene/style-tokens.js'

function background(color: ColorValue | undefined): string {
  return surfaceOf(color, 'yellow')
}

function StickyRenderer({ object }: ObjectViewProps<StickyData>) {
  return (
    <div
      className="of-sticky"
      style={{
        background: background(object.style.color),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
        justifyContent: verticalAlign(object.style.verticalAlign),
        opacity: object.style.opacity ?? 1,
      }}
      // A real, focusable DOM node with an accessible name. Canvas-based
      // renderers cannot offer this at all, and retrofitting accessibility onto
      // a pixel buffer is far harder than keeping it from the start.
      role="group"
      // What it is, not what it says: the text is read as the group's content,
      // and naming the group by it read every note twice.
      aria-label={isEmptyText(object.data.text) ? 'Empty sticky note' : 'Sticky note'}
    >
      <div className="of-sticky__text" data-testid="sticky-text" data-fit-text>
        <RichTextView value={object.data.text} />
      </div>
    </div>
  )
}

function StickyEditor({ object, Chrome, onCommit }: ObjectEditorProps<StickyData>) {
  return (
    <RichTextEditor
      initialText={object.data.text}
      Chrome={Chrome}
      className="of-sticky of-sticky__editor"
      style={{
        background: background(object.style.color),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
        justifyContent: verticalAlign(object.style.verticalAlign),
      }}
      ariaLabel="Edit sticky note text"
      onCommit={(text) => onCommit({ text })}
    />
  )
}

/**
 * Placed where you press, at the size every note is — a wall of notes at
 * different sizes stops reading as a wall of notes. Miro binds sticky notes to
 * N, so both keys arm it rather than make people relearn.
 */
const stickyTool: ObjectTool = {
  label: 'Sticky',
  keys: ['s', 'n'],
  order: 10,
  place: 'click',
  Icon: () => <StickyIcon />,
  cursor: () => ({ body: 'M4.5 4h15v9.6L13.6 20H4.5z', detail: 'M19.5 13.6h-5.9v6.4' }),
}

export const stickyView = defineObjectView<StickyData>({
  type: 'sticky',
  tool: stickyTool,
  defaultColor: 'yellow',
  Renderer: StickyRenderer,
  InlineEditor: StickyEditor,
})
