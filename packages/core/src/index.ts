/**
 * @openframe/core — the OpenFrame domain.
 *
 * Pure TypeScript. No React, no DOM, no database, no CRDT, no AI provider.
 * Everything else in the system depends on this package; this package depends
 * on nothing but `zod` and `fractional-indexing`.
 *
 * That constraint is enforced mechanically — see `.dependency-cruiser.cjs` and
 * `src/architecture.test.ts` — because it is the claim the whole architecture
 * rests on: the canvas renderer, the database and the collaboration provider
 * can all be replaced without the domain noticing.
 */
export * from './geometry/index.js'
export * from './domain/index.js'
export * from './domain/factory.js'
export * from './schema/index.js'
export * from './commands/index.js'
export * from './ports/index.js'
export * from './store/index.js'
export * from './types/index.js'
