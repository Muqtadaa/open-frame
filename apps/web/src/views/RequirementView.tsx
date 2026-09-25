import type { RequirementData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { StructuredEditor, StructuredSlip, statusLine } from './StructuredSlip.js'

function RequirementRenderer(props: ObjectViewProps<RequirementData>) {
  const { object } = props
  return (
    <StructuredSlip
      {...props}
      text={object.data.text}
      noun="Requirement"
      record={[statusLine(object.data.priority, 'unset')]}
      defaultColor="red"
      className="of-requirement"
    />
  )
}

function RequirementEditor(props: ObjectEditorProps<RequirementData>) {
  return (
    <StructuredEditor
      {...props}
      text={props.object.data.text}
      label="Edit requirement"
      defaultColor="red"
      className="of-requirement"
    />
  )
}

export const requirementView = defineObjectView<RequirementData>({
  type: 'requirement',
  defaultColor: 'red',
  Renderer: RequirementRenderer,
  InlineEditor: RequirementEditor,
})
