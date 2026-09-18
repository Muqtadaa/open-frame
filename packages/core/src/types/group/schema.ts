import { type ZodType, z } from 'zod'

/**
 * A group is pure STRUCTURE: it has no content of its own.
 *
 * The empty payload is the point rather than an oversight. Everything about a
 * group — where it is, how big it is, what it contains — is a consequence of
 * its children, so storing any of it would be storing something derivable and
 * letting the two disagree (rule 16).
 *
 * It exists as an object rather than as a `groupId` field on its members so
 * that grouping reuses the parent/child machinery already in place: cycle
 * checks, cascading delete, paint order and move-with-container all work
 * without a second, parallel hierarchy to keep consistent.
 */
export type GroupData = Record<string, never>

export const GROUP_VERSION = 1

/**
 * `.strict()` is load-bearing. A plain `z.object({})` STRIPS unknown keys, so a
 * group would have validated any payload at all and quietly discarded it —
 * exactly the boundary check rule 8 asks for, passing vacuously. The registry
 * contract test caught it.
 */
export const GroupDataSchema: ZodType<GroupData> = z.object({}).strict()
