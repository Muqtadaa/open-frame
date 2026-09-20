import { ObjectViewRegistry } from './registry.js'
import { connectorView } from './ConnectorView.js'
import { evidenceView } from './EvidenceView.js'
import { frameView } from './FrameView.js'
import { groupView } from './GroupView.js'
import { imageView } from './ImageView.js'
import { insightView } from './InsightView.js'
import { hypothesisView } from './HypothesisView.js'
import { experimentView } from './ExperimentView.js'
import { decisionView } from './DecisionView.js'
import { taskView } from './TaskView.js'
import { journeyStageView } from './JourneyStageView.js'
import { requirementView } from './RequirementView.js'
import { shapeView } from './ShapeView.js'
import { codeView } from './CodeView.js'
import { stickyView } from './StickyView.js'
import { tableView } from './TableView.js'
import { textView } from './TextView.js'
import { unknownView } from './UnknownView.js'

export { FallbackView } from './FallbackView.js'
export * from './registry.js'

/**
 * The React views this build ships.
 *
 * Adding a semantic type means one line here and one line in core's
 * `types/index.ts`. Nothing else in the application changes.
 */
export function createDefaultViewRegistry(): ObjectViewRegistry {
  return new ObjectViewRegistry([
    stickyView,
    tableView,
    codeView,
    textView,
    shapeView,
    frameView,
    connectorView,
    imageView,
    groupView,
    evidenceView,
    insightView,
    hypothesisView,
    experimentView,
    decisionView,
    taskView,
    journeyStageView,
    requirementView,
    unknownView,
  ])
}
