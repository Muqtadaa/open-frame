import { readableTypeName } from '@openframe/core'

import type { ObjectViewProps } from './registry.js'

/**
 * Rendered when an object's TYPE IS REGISTERED IN THE DOMAIN but has no React
 * view — the seam between the two registries, made visible.
 *
 * In practice this means a type shipped in core ahead of its UI. Showing a
 * labelled box is strictly better than the alternatives: crashing the board, or
 * silently rendering nothing and leaving the user to wonder what happened to
 * their content.
 */
export function FallbackView({ object }: ObjectViewProps) {
  const name = readableTypeName(object.type)
  return (
    <div className="of-fallback" role="group" aria-label={`${name} that this version cannot show`}>
      <span className="of-fallback__type">{name}</span>
      <span className="of-fallback__hint">This version cannot show it yet</span>
    </div>
  )
}
