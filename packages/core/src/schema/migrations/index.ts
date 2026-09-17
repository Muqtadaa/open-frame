/**
 * Document-envelope migrations.
 *
 * THREE RULES, and the first one is the one that gets broken:
 *
 * 1. A migration must NEVER import a current domain type. It declares its own
 *    local input and output shapes. A migration that imports today's
 *    `BoardDocument` silently changes meaning every time that type changes, and
 *    then it is no longer a migration — it is a bug that only fires on old data
 *    nobody has in front of them.
 *
 * 2. Migrations are pure functions over plain JSON. No clock, no randomness,
 *    no IO, no UI. That is what makes them testable from frozen fixtures.
 *
 * 3. Migrations are forward-only and are never deleted or edited once shipped.
 *    Documents saved by old builds exist forever.
 *
 * Keyed by TARGET version: `documentMigrations[2]` takes v1 to v2.
 */
export type DocumentMigration = (payload: unknown) => unknown

export const documentMigrations: Readonly<Record<number, DocumentMigration>> = {
  // v1 is the initial format — there is nothing before it to migrate from.
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

/**
 * Walks a payload from its stored version up to the current one.
 *
 * Throws on a GAP in the chain rather than skipping it. Keying by target
 * version makes a missing step easy to miss — if `migrations[3]` exists but
 * `migrations[2]` does not, a naive loop would happily "migrate" a v1 document
 * to v3 while skipping half the transformation.
 */
export function migrateDocumentPayload(
  payload: unknown,
  fromVersion: number,
  toVersion: number,
  migrations: Readonly<Record<number, DocumentMigration>> = documentMigrations,
): unknown {
  if (fromVersion > toVersion) {
    throw new MigrationError(
      `Document is version ${fromVersion}, newer than the supported version ${toVersion}`,
    )
  }
  let current = payload
  for (let target = fromVersion + 1; target <= toVersion; target++) {
    const migration = migrations[target]
    if (migration === undefined) {
      throw new MigrationError(`No document migration registered for version ${target}`)
    }
    current = migration(current)
  }
  return current
}
