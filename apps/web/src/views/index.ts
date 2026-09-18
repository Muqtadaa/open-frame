import { ObjectViewRegistry } from './registry.js'
import { frameView } from './FrameView.js'
import { shapeView } from './ShapeView.js'
import { stickyView } from './StickyView.js'
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
  return new ObjectViewRegistry([stickyView, textView, shapeView, frameView, unknownView])
}
