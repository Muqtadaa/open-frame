import { type FrameData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import { FRAME_PAPER, inkColor, surfaceOf } from '../scene/style-tokens.js'

/*
 * A filled frame is a sheet laid on the page — the world's paper until
 * somebody colours it. It was gray, the same stock as a shape, a code block
 * and an evidence slip, so a filled frame read as one more of them rather than
 * as the place they sit; then white, which After Hours turned into a bright
 * slab under everything on it (audit 2026-09-27). The paper is white by day
 * and the panel stock at night, and a colour somebody chose — white included —
 * is painted exactly as chosen.
 */
function frameSurface(style: FrameViewStyle): string {
  if ((style.fill ?? 'solid') === 'none') return 'transparent'
  return style.color === undefined ? FRAME_PAPER : surfaceOf(style.color, 'white')
}

type FrameViewStyle = ObjectViewProps<FrameData>['object']['style']

/**
 * A frame's edge: a HAIRLINE with a 2px corner, at every zoom.
 *
 * The frame is drawn in world space, so a 1px border is 4px of ink at 400%
 * and the 2px corner an 8px curve — at which point a frame stops reading as a
 * ruled boundary and starts reading as a rounded card, which this world
 * refuses. It used to be held there by dividing the width by the zoom, which
 * works down to one pixel and then stops: at 1600% the border came back as
 * one WORLD pixel and painted sixteen beside the selection line (rule 24).
 *
 * So the edge is the one counter-scale that works: an element laid out at
 * `zoom` times the frame's size, with an ordinary 1px border, and PAINTED at
 * `1 / zoom`. Nothing is ever asked for a sub-pixel border.
 */
function FrameEdge({ zoom, color }: { readonly zoom: number; readonly color: string | undefined }) {
  return (
    <div
      className="of-frame__edge"
      aria-hidden="true"
      style={{
        width: `${String(zoom * 100)}%`,
        height: `${String(zoom * 100)}%`,
        transform: `scale(${String(1 / zoom)})`,
        ...(color === undefined ? {} : { borderColor: color }),
      }}
    />
  )
}

function FrameRenderer({ object, zoom }: ObjectViewProps<FrameData>) {
  return (
    <div
      className="of-frame"
      style={{
        background: frameSurface(object.style),
        // The corner is the edge's, drawn by `FrameEdge` below.
        borderRadius: `${String(2 / zoom)}px`,
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      aria-label="Frame"
    >
      <FrameEdge zoom={zoom} color={inkColor(object.style.strokeColor)} />
      <div
        className="of-frame__title"
        style={{
          /*
           * Counter-scaling keeps the title legible at 25% and unobtrusive at
           * 400%, the way frame labels behave in every tool users come from.
           *
           * Nothing inside it is divided by the zoom. The world is already
           * scaled by `zoom` and this element by `1 / zoom`, so the two cancel
           * and a CSS pixel here is a screen pixel — a second division applied
           * it twice, and a title band halved with every doubling of the zoom.
           *
           * Its BOTTOM edge sits on the frame's top edge (the stylesheet's
           * `bottom: 100%`), which is where `transformOrigin` pins it, so a
           * title of several lines grows upward, away from the frame.
           */
          transform: `scale(${String(1 / zoom)})`,
          transformOrigin: '0 100%',
          color: inkColor(object.style.textColor),
        }}
      >
        <RichTextView value={object.data.name} />
      </div>
    </div>
  )
}

function FrameEditor({ object, zoom, Chrome, onCommit }: ObjectEditorProps<FrameData>) {
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
        background: frameSurface(object.style),
        // The corner is the edge's, drawn by `FrameEdge` below.
        borderRadius: `${String(2 / zoom)}px`,
        opacity: object.style.opacity ?? 1,
      }}
    >
      <FrameEdge zoom={zoom} color={inkColor(object.style.strokeColor)} />
      <RichTextEditor
        initialText={object.data.name}
        className="of-frame__title of-frame__editor"
        style={{
          transform: `scale(${String(1 / zoom)})`,
          transformOrigin: '0 100%',
          color: inkColor(object.style.textColor),
        }}
        ariaLabel="Rename frame"
        Chrome={Chrome}
        onCommit={(name) => {
          onCommit({ name })
        }}
      />
    </div>
  )
}

export const frameView = defineObjectView<FrameData>({
  type: 'frame',
  // Its hairline edge is laid out at the zoom and painted back down.
  usesZoom: true,
  /*
   * No `defaultColor`: an unset frame is on the world's paper, which no
   * swatch is. Marking `white` would mark a colour that, at night, pressing
   * would CHANGE the frame to — so the record panel marks nothing.
   */
  Renderer: FrameRenderer,
  InlineEditor: FrameEditor,
})
