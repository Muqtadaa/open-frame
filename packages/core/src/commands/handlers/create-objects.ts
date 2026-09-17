import { childrenOf } from '../../domain/document.js'
import type { BoardDocument } from '../../domain/document.js'
import { instantiateObject } from '../../domain/factory.js'
import { orderBetween } from '../../domain/order.js'
import type { OrderKey } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { CommandContext, Command } from '../types.js'

type CreateObjects = Extract<Command, { kind: 'CreateObjects' }>

export function createObjects(
  doc: BoardDocument,
  command: CreateObjects,
  ctx: CommandContext,
): Patch[] {
  if (command.objects.length === 0) {
    throw new CommandError('invalid-input', 'CreateObjects requires at least one object')
  }

  // New objects go on top of their container, so track the last key per parent
  // as we go — otherwise every object in one command would get the same order.
  const lastOrderByParent = new Map<string, OrderKey | null>()

  const patches: Patch[] = []
  for (const spec of command.objects) {
    const definition = ctx.registry.get(spec.type)
    if (definition === undefined) {
      throw new CommandError('unknown-type', `Object type "${spec.type}" is not registered`)
    }
    if (!Number.isFinite(spec.x) || !Number.isFinite(spec.y)) {
      throw new CommandError('invalid-input', 'Object position must be finite')
    }

    const parentId = spec.parentId ?? null
    const parentKey = parentId ?? '__root__'
    let previous = lastOrderByParent.get(parentKey)
    if (previous === undefined) {
      const siblings = childrenOf(doc, parentId)
      previous = siblings[siblings.length - 1]?.order ?? null
    }
    const order = orderBetween(previous, null)
    lastOrderByParent.set(parentKey, order)

    const object = instantiateObject({
      definition,
      id: ctx.ids.objectId(),
      order,
      x: spec.x,
      y: spec.y,
      parentId,
      ...(spec.width === undefined ? {} : { width: spec.width }),
      ...(spec.height === undefined ? {} : { height: spec.height }),
      ...(spec.style === undefined ? {} : { style: spec.style }),
      ...(spec.data === undefined ? {} : { data: spec.data }),
      createdAt: ctx.clock.now(),
      createdBy: ctx.actor,
      createdVia: ctx.origin,
    })

    // Validate what the type's own factory produced, so a buggy `create` is
    // caught at the boundary rather than at save time.
    const validated = definition.validate(object.data)
    if (!validated.ok) {
      throw new CommandError(
        'invalid-data',
        `Object type "${spec.type}" produced invalid data: ${validated.issues.join('; ')}`,
      )
    }

    patches.push({ op: 'add', id: object.id, object })
  }
  return patches
}
