import type { BoardDocument } from '../../domain/document.js'
import { asObjectId } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import { REACTION_MARK, REACTION_TYPE, reactionId } from '../../types/reaction/definition.js'
import { ReactionDataSchema } from '../../types/reaction/schema.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { createObjects } from './create-objects.js'
import { requireObject } from './shared.js'

type ToggleReaction = Extract<Command, { kind: 'ToggleReaction' }>

/**
 * One person's reaction, added or taken away.
 *
 * Whether this adds or removes is asked of the registry's mark index — is
 * there a reaction of this kind, by this person, on this note — and NOT of the
 * id. Generic commands can make or edit a reaction too (an agent's
 * `create_objects`, an `UpdateObjectData`), and then its id says nothing about
 * what it is; looking it up by id left such a reaction impossible to take back,
 * and pressing the chip added a second. Every match is removed, so a stray
 * duplicate goes with the one the person meant.
 *
 * A NEW reaction still takes the id that is a function of what it is on, what
 * it is and who left it, so one person reacting from two devices at once
 * converges on one object instead of two.
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

  const { glyph, by } = data.data
  const mine = ctx.registry
    .marksOn(doc, target.id)
    .filter(
      (link) =>
        link.edge.kind === REACTION_MARK && link.edge.value === glyph && link.edge.by === by.key,
    )
  if (mine.length > 0) return mine.map((link) => ({ op: 'remove', id: link.id }))

  const id = asObjectId(reactionId(target.id, glyph, by.key))
  if (doc.objects.has(id)) {
    throw new CommandError('invalid-input', 'Something else already has that reaction’s id')
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
