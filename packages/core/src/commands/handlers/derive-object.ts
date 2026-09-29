import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { createObjects } from './create-objects.js'
import { requireFinite, requireObject } from './shared.js'

type DeriveObject = Extract<Command, { kind: 'DeriveObject' }>

/**
 * The synthesis motion: a new object, related back to each thing it was drawn
 * from. WHICH derivations exist and what their predicates mean are the
 * registry's business; this carries one out.
 *
 * The object and its relations are ONE command, so they are one undo step.
 * Split, an undo could leave an insight standing on nothing — a claim whose
 * provenance vanished, which is the one thing this product must not do.
 */
export function deriveObject(
  doc: BoardDocument,
  command: DeriveObject,
  ctx: CommandContext,
): Patch[] {
  requireFinite(command.x, 'Derive x')
  requireFinite(command.y, 'Derive y')
  const sources = command.from
    .map((id) => requireObject(doc, id))
    // A relation to something with no place on the board would be a citation
    // of a citation, which nothing today means.
    .filter((object) => ctx.registry.get(object.type)?.capabilities.spatial !== false)
  if (sources.length === 0) {
    throw new CommandError('invalid-input', 'There is nothing on the board to derive from')
  }

  const id = command.id ?? ctx.ids.objectId()
  return createObjects(
    doc,
    {
      kind: 'CreateObjects',
      objects: [
        { type: command.toType, id, x: command.x, y: command.y },
        /*
         * Direction is new → source: the new object is the one making the
         * claim, so it is the one that cites, derives from or tests.
         */
        ...sources.map((source) => ({
          type: 'relation',
          x: 0,
          y: 0,
          data: { from: id, to: source.id, predicate: command.predicate },
        })),
      ],
    },
    ctx,
  )
}
