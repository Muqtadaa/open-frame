import { ObjectViewRegistry } from './registry.js'
import { stickyView } from './StickyView.js'
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
  return new ObjectViewRegistry([stickyView, unknownView])
}
