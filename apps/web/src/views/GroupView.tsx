import { defineObjectView } from './registry.js'

/**
 * A group draws nothing.
 *
 * It is structure, not content: the members draw themselves, and the selection
 * box comes from `registry.boundsOf` like any other object's. Drawing an
 * outline here as well would double it.
 *
 * The view exists only so the group is not treated as a type whose React half
 * is missing — without it, `FallbackView` would helpfully label every group
 * "No view registered".
 */
export const groupView = defineObjectView({
  type: 'group',
  Renderer: () => null,
})
