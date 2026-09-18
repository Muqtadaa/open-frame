import { type ZodType, z } from 'zod'

/**
 * A quote, observation or measurement, with the trail back to where it came
 * from.
 *
 * This is the type the product exists for: a sticky note and a piece of
 * evidence are the same kind of thing to the system, differing only in the
 * payload they carry (PRODUCT.md). Everything here is the payload.
 *
 * Every field except `text` is optional-by-emptiness rather than optional in
 * the schema. `source: ''` and a missing `source` would otherwise be two ways
 * to say the same thing, and every consumer — search, export, the inspector,
 * a future filter — would have to handle both. Structure is still earned:
 * nothing rejects an evidence card that carries only a quote.
 */
export interface EvidenceData {
  readonly text: string
  /** Where it came from: a study, a ticket, a recording, an analytics export. */
  readonly source: string
  /** Who it came from, when that is a person. Usually anonymised — "P07". */
  readonly participant: string
  readonly tags: readonly string[]
}

export const EVIDENCE_VERSION = 1

export const EvidenceDataSchema: ZodType<EvidenceData> = z
  .object({
    text: z.string(),
    source: z.string(),
    participant: z.string(),
    tags: z.array(z.string()),
  })
  /*
   * Strict, because Zod strips unknown keys by default — a `z.object({})` that
   * accepted every payload is a mistake this codebase has already made once.
   * On a type meant to be written by AI and an API later, silent acceptance of
   * an invented field is the failure mode that matters.
   */
  .strict()
