import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import { resolveEndpoints } from './geometry.js'
import { CONNECTOR_TYPE } from './definition.js'
import type { ConnectorData, ConnectorEndpoint } from './schema.js'

function attachedTo(endpoint: ConnectorEndpoint, doomed: ReadonlySet<ObjectId>): boolean {
  return endpoint.kind === 'object' && doomed.has(endpoint.objectId)
}

/**
 * What happens to connectors when the objects they attach to are deleted.
 *
 *   one end orphaned   -> that end becomes a FREE POINT where it last sat,
 *                         preserving a connector that still means something
 *   both ends orphaned -> the connector is deleted; a line between two things
 *                         that no longer exist is litter, not content
 *
 * A free end is not a special case in the renderer: free points already exist
 * in the model, because that is also what a connector looks like while it is
 * being drawn. Re-attaching one is the same endpoint drag that created it.
 */
export function detachConnectors(
  doc: BoardDocument,
  doomed: ReadonlySet<ObjectId>,
): { readonly patches: readonly Patch[]; readonly alsoDelete: readonly ObjectId[] } {
  const patches: Patch[] = []
  const alsoDelete: ObjectId[] = []

  for (const object of doc.objects.values()) {
    if (object.type !== CONNECTOR_TYPE || doomed.has(object.id)) continue
    const data = object.data as ConnectorData

    const fromLost = attachedTo(data.from, doomed)
    const toLost = attachedTo(data.to, doomed)
    if (!fromLost && !toLost) continue

    if (fromLost && toLost) {
      alsoDelete.push(object.id)
      continue
    }

    // Freeze the orphaned end where it currently renders, so the connector does
    // not visibly jump when its neighbour disappears.
    const { start, end } = resolveEndpoints(doc, data.from, data.to)
    const frozen = fromLost ? start : end
    patches.push({
      op: 'set',
      id: object.id,
      path: ['data', fromLost ? 'from' : 'to'],
      value: { kind: 'point', x: frozen.x, y: frozen.y },
    })
  }

  return { patches, alsoDelete }
}
