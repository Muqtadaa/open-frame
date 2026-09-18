import { type ZodType, z } from 'zod'

import type { ObjectId } from '../../domain/ids.js'

/**
 * A directed, named link between two objects.
 *
 * ADR 0011. A relation is an OBJECT rather than an array of ids inside the
 * subject's data, because an array is written as a whole-array `set`: two people
 * citing the same insight concurrently produce two such writes and one citation
 * is lost. Two relation objects are two `add` patches, which commute.
 *
 * It carries no geometry. `spatial: false` keeps it out of paint order, culling,
 * hit testing and marquee selection.
 */
export interface RelationData {
  readonly from: ObjectId
  readonly to: ObjectId
  /**
   * What the link MEANS, as a verb read from subject to object: "evidence
   * `supports` insight".
   *
   * Free text for now. ADR 0011 leaves the vocabulary open deliberately — which
   * predicates exist, and whether the registry validates the pairing, is a
   * product question that needs the eight semantic types to exist first.
   */
  readonly predicate: string
}

export const RELATION_VERSION = 1

export const RelationDataSchema: ZodType<RelationData> = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    predicate: z.string().min(1),
  })
  .strict() as unknown as ZodType<RelationData>
