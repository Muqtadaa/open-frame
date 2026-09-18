import type { ExperimentData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { StructuredEditor, StructuredSlip, statusLine } from './StructuredSlip.js'

function ExperimentRenderer(props: ObjectViewProps<ExperimentData>) {
  const { object } = props
  return (
    <StructuredSlip
      {...props}
      text={object.data.text}
      noun="Experiment"
      record={[object.data.method, statusLine(object.data.status, 'planned')]}
      defaultColor="blue"
      className="of-experiment"
    />
  )
}

function ExperimentEditor(props: ObjectEditorProps<ExperimentData>) {
  return (
    <StructuredEditor
      {...props}
      text={props.object.data.text}
      label="Edit experiment"
      defaultColor="blue"
      className="of-experiment"
    />
  )
}

export const experimentView = defineObjectView<ExperimentData>({
  type: 'experiment',
  Renderer: ExperimentRenderer,
  InlineEditor: ExperimentEditor,
})
