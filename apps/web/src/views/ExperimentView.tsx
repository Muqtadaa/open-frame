import type { ExperimentData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { StructuredEditor, StructuredSlip, statusLine } from './StructuredSlip.js'

/*
 * Grey, sharing with evidence — eight structured types against seven colour
 * tokens forces exactly one collision, and this is the pair to spend it on.
 *
 * Evidence and experiment are the two EMPIRICAL types, as against the claims
 * (insight, hypothesis) and the choices (decision, task, requirement), so the
 * shared colour says something true. They are also the furthest apart on the
 * spine, where the earlier blue put experiment two steps from insight and made
 * the chain look mis-coloured.
 */
function ExperimentRenderer(props: ObjectViewProps<ExperimentData>) {
  const { object } = props
  return (
    <StructuredSlip
      {...props}
      text={object.data.text}
      noun="Experiment"
      record={[object.data.method, statusLine(object.data.status, 'planned')]}
      defaultColor="gray"
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
      defaultColor="gray"
      className="of-experiment"
    />
  )
}

export const experimentView = defineObjectView<ExperimentData>({
  type: 'experiment',
  Renderer: ExperimentRenderer,
  InlineEditor: ExperimentEditor,
})
