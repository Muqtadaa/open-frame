import { type ZodType, z } from 'zod'

import type { ObjectId } from '../../domain/ids.js'

/**
 * Where a connector end attaches.
 *
 * `relative` is NORMALISED (0..1 across the target's frame) so an attachment
 * survives the target being resized. Absolute offsets would drift the moment
 * anything changed size.
 */
export const AnchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('auto') }),
  z.object({ kind: z.literal('side'), side: z.enum(['top', 'right', 'bottom', 'left']) }),
  z.object({ kind: z.literal('relative'), u: z.number(), v: z.number() }),
])

export type Anchor = z.infer<typeof AnchorSchema>

/**
 * A connector end: either a free point in space, or an attachment to an object.
 *
 * Both forms exist from the start because a free end is not an edge case — it
 * is what an attachment BECOMES when its object is deleted, and what a
 * half-drawn connector is while being drawn.
 */
export const EndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('point'), x: z.number(), y: z.number() }),
  z.object({ kind: z.literal('object'), objectId: z.string().min(1), anchor: AnchorSchema }),
])

export type ConnectorEndpoint =
  | { readonly kind: 'point'; readonly x: number; readonly y: number }
  | { readonly kind: 'object'; readonly objectId: ObjectId; readonly anchor: Anchor }

export const ROUTINGS = ['straight', 'orthogonal', 'curved'] as const
export type Routing = (typeof ROUTINGS)[number]

/**
 * What sits at the end of a line.
 *
 * Adding a cap needs no migration, for the same reason adding a shape kind
 * does not: an existing document's value stays valid and the version is
 * unchanged. REMOVING one would break every board holding it.
 *
 * Direction is not a field. A line that points one way has a cap at one end,
 * both ways has two, and neither has none — so the two ends already say it,
 * and a third value saying it again is the copy that goes stale.
 */
export const ARROWHEADS = [
  'none',
  'arrow',
  'triangle',
  'dot',
  'diamond',
  'semicircle',
  'bar',
] as const
export type Arrowhead = (typeof ARROWHEADS)[number]

export interface ConnectorData {
  readonly from: ConnectorEndpoint
  readonly to: ConnectorEndpoint
  readonly routing: Routing
  readonly startArrow: Arrowhead
  readonly endArrow: Arrowhead
  readonly text: string
}

export const CONNECTOR_VERSION = 1

export const ConnectorDataSchema: ZodType<ConnectorData> = z.object({
  from: EndpointSchema,
  to: EndpointSchema,
  routing: z.enum(ROUTINGS),
  startArrow: z.enum(ARROWHEADS),
  endArrow: z.enum(ARROWHEADS),
  text: z.string(),
}) as unknown as ZodType<ConnectorData>
