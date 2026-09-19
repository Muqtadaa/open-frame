import { CommandDispatcher } from './commands/dispatcher.js'
import { createEmptyDocument } from './domain/document.js'
import { asBoardId } from './domain/ids.js'
import type { ObjectTypeRegistry } from './domain/registry.js'
import { allowAllCapabilities, type Capabilities } from './ports/capabilities.js'
import { fixedClock } from './ports/clock.js'
import { createSequentialIdGenerator, type IdGenerator } from './ports/id-generator.js'
import {
  createDocumentStore,
  type DocumentStore,
  type DocumentWriter,
} from './store/document-store.js'
import { createDefaultRegistry } from './types/index.js'

export interface TestHarness {
  readonly store: DocumentStore
  readonly writer: DocumentWriter
  readonly registry: ObjectTypeRegistry
  readonly dispatcher: CommandDispatcher
}

/**
 * A fully wired domain with deterministic ids and a frozen clock.
 *
 * Every dependency that could make a test flaky is a port, so this needs no
 * mocking framework, no fake timers and no DOM.
 */
export function createTestHarness(
  options: {
    readonly registry?: ObjectTypeRegistry
    /**
     * Only for a test with TWO harnesses in it — two collaborating clients.
     * Sequential ids restart at the same number in each, so without separate
     * generators both peers name their first object `obj_0001` and the merge
     * being tested is a collision that could never happen in production.
     */
    readonly ids?: IdGenerator
    /**
     * Only for a test about authorization. Everything else wants `allowAll`,
     * which is what single-player local development actually has.
     */
    readonly capabilities?: Capabilities
  } = {},
): TestHarness {
  const registry = options.registry ?? createDefaultRegistry()
  const { store, writer } = createDocumentStore(
    createEmptyDocument(asBoardId('board_test'), 'Test board', 0),
  )
  const dispatcher = new CommandDispatcher({
    store,
    writer,
    registry,
    clock: fixedClock(1_700_000_000_000),
    ids: options.ids ?? createSequentialIdGenerator(),
    capabilities: options.capabilities ?? allowAllCapabilities,
  })
  return { store, writer, registry, dispatcher }
}
