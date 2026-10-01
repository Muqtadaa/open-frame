import type { FieldDefinition } from '@openframe/core'

/**
 * Tags are edited as one comma-separated line.
 *
 * A chip editor is the better control and is not this change: a text line is
 * honest about what it stores, and it round-trips exactly — which a chip
 * editor with its own parsing would have to prove separately.
 */
export function toText(field: FieldDefinition, stored: unknown): string {
  if (field.kind === 'tags') return Array.isArray(stored) ? stored.join(', ') : ''
  return typeof stored === 'string' ? stored : ''
}

export function fromText(field: FieldDefinition, text: string): unknown {
  if (field.kind !== 'tags') return text
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
}
