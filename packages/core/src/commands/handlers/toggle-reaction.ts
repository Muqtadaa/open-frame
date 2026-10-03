import type { BoardDocument } from '../../domain/document.js'
import { asObjectId } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import { REACTION_TYPE, reactionId } from '../../types/reaction/definition.js'
import { ReactionDataSchema } from '../../types/reaction/schema.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { createObjects } from './create-objects.js'
import { requireObject } from './shared.js'

type ToggleReaction = Extract<Command, { kind: 'ToggleReaction' }>

/**
 * One person's reaction, added or taken away.
 *
 * The reaction's id is a function of what it is on, what it is and who left
 * it, so whether this adds or removes is a lookup, and the same person
 * reacting from two devices at once converges on one object instead of two.
 *
 * A LOCKED note can still be reacted to: a reaction is a separate object, and
 * locking a note stops people changing it, not responding to it.
 */
export function toggleReaction(
  doc: BoardDocument,
  command: ToggleReaction,
  ctx: CommandContext,
): Patch[] {
  const target = requireObject(doc, command.target)
  if (ctx.registry.get(target.type)?.capabilities.markable !== true) {
    throw new CommandError('invalid-input', `A ${target.type} cannot be reacted to`)
  }

  // At the boundary (rule 8): the glyph and the author arrive from callers
  // that include agents and the API, and become part of an id.
  const data = ReactionDataSchema.safeParse({
    target: command.target,
    glyph: command.glyph,
    by: command.by,
  })
  if (!data.success) {
    throw new CommandError('invalid-input', 'That is not a reaction this board can hold')
  }

  const id = asObjectId(reactionId(target.id, data.data.glyph, data.data.by.key))
  const existing = doc.objects.get(id)
  if (existing !== undefined) {
    if (existing.type !== REACTION_TYPE) {
      throw new CommandError('invalid-input', 'Something else already has that reaction’s id')
    }
    return [{ op: 'remove', id }]
  }

  return createObjects(
    doc,
    {
      kind: 'CreateObjects',
      objects: [{ type: REACTION_TYPE, id, x: 0, y: 0, data: { ...data.data } }],
    },
    ctx,
  )
}
