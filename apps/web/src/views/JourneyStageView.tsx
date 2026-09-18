import type { JourneyStageData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { StructuredEditor, StructuredSlip, statusLine } from './StructuredSlip.js'

function JourneyStageRenderer(props: ObjectViewProps<JourneyStageData>) {
  const { object } = props
  return (
    <StructuredSlip
      {...props}
      text={object.data.text}
      noun="Journey stage"
      record={[statusLine(object.data.sentiment, 'unstated')]}
      defaultColor="yellow"
      className="of-journey-stage"
    />
  )
}

function JourneyStageEditor(props: ObjectEditorProps<JourneyStageData>) {
  return (
    <StructuredEditor
      {...props}
      text={props.object.data.text}
      label="Edit journey stage"
      defaultColor="yellow"
      className="of-journey-stage"
    />
  )
}

export const journeyStageView = defineObjectView<JourneyStageData>({
  type: 'journey-stage',
  Renderer: JourneyStageRenderer,
  InlineEditor: JourneyStageEditor,
})
