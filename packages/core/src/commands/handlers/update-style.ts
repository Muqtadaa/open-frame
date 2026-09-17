import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import type { StyleProp } from '../../domain/object.js'
import { CommandError } from '../errors.js'
import type { CommandContext, Command } from '../types.js'
import { requireObject, requireUnlocked } from './shared.js'

type UpdateStyle = Extract<Command, { kind: 'UpdateStyle' }>

/**
 * Applies style tokens across a selection of mixed types.
 *
 * Each type declares which style properties it honours; properties it does not
 * are silently skipped rather than rejected. That is what lets "make the
 * selection yellow" work on a mixed bag of stickies, shapes and future
 * `evidence` objects without a single `switch (object.type)` — the registry
 * answers, and this handler stays the same forever.
 */
export function updateStyle(
  doc: BoardDocument,
  command: UpdateStyle,
  ctx: CommandContext,
): Patch[] {
  if (command.ids.length === 0) {
    throw new CommandError('invalid-input', 'UpdateStyle requires at least one id')
  }

  const requested = Object.entries(command.style).filter(([, value]) => value !== undefined)
  if (requested.length === 0) {
    throw new CommandError('invalid-input', 'UpdateStyle requires at least one style property')
  }

  const patches: Patch[] = []
  for (const id of command.ids) {
    const object = requireUnlocked(requireObject(doc, id))
    const supported = new Set<StyleProp>(
      ctx.registry.get(object.type)?.capabilities.styleProps ?? [],
    )

    for (const [property, value] of requested) {
      if (!supported.has(property as StyleProp)) continue
      if (object.style[property as StyleProp] === value) continue
      patches.push({ op: 'set', id, path: ['style', property], value })
    }
  }
  return patches
}
