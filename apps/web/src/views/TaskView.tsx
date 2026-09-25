import type { TaskData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { StructuredEditor, StructuredSlip, statusLine } from './StructuredSlip.js'

function TaskRenderer(props: ObjectViewProps<TaskData>) {
  const { object } = props
  return (
    <StructuredSlip
      {...props}
      text={object.data.text}
      noun="Task"
      record={[object.data.assignee, statusLine(object.data.status, 'todo')]}
      defaultColor="orange"
      className="of-task"
    />
  )
}

function TaskEditor(props: ObjectEditorProps<TaskData>) {
  return (
    <StructuredEditor
      {...props}
      text={props.object.data.text}
      label="Edit task"
      defaultColor="orange"
      className="of-task"
    />
  )
}

export const taskView = defineObjectView<TaskData>({
  type: 'task',
  defaultColor: 'orange',
  Renderer: TaskRenderer,
  InlineEditor: TaskEditor,
})
