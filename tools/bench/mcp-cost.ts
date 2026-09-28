/**
 * What an agent peer costs, on a board of real size (tracks P2).
 *
 * Two costs were assumed small and never measured:
 *
 * - the MCP read tools sort the whole board on every call, find a page's
 *   cursor by scanning, and describe every object to search it;
 * - the dispatcher copies the whole object map once per COMMAND in a
 *   transaction, so an agent creating 200 objects one command at a time pays
 *   200 copies on its own peer — and a remote batch is copied three times on
 *   every other peer.
 *
 * The copies are COUNTED as well as timed. Time says whether it matters on
 * this machine; the count says why, and does not change with the machine. A
 * copy is any `Map` built at the board's size or larger while a case runs,
 * found by swapping the global `Map` for one that counts — nothing in core
 * knows it is being watched.
 *
 *   pnpm bench:fixtures && pnpm bench:mcp
 *   pnpm bench:mcp:smoke        (60 objects, one run: proves the script runs)
 */
import { readFileSync } from 'node:fs'

import {
  CommandDispatcher,
  allowAllCapabilities,
  asBoardId,
  createDefaultRegistry,
  createDocumentStore,
  createSequentialIdGenerator,
  deserializeBoard,
  fixedClock,
  type BoardDocument,
  type Command,
  type Patch,
} from '@openframe/core'

import type { BoardPeer } from '../../apps/mcp/src/board.js'
import type { SignedIn } from '../../apps/mcp/src/supabase/account.js'
import { toolContext } from '../../apps/mcp/src/tools/context.js'
import { getObjects, searchBoard } from '../../apps/mcp/src/tools/read.js'

const smoke = process.argv.includes('--smoke')
const boards = smoke ? ['board-mixed-60'] : ['board-mixed-1000', 'board-mixed-10000']
const WARM = smoke ? 0 : 3
const RUNS = smoke ? 1 : 10
const AGENT_BATCH = smoke ? 10 : 200

const registry = createDefaultRegistry()

function load(name: string): BoardDocument {
  const raw: unknown = JSON.parse(readFileSync(`tools/bench/fixtures/${name}.json`, 'utf8'))
  const result = deserializeBoard(raw, registry)
  if (result.status !== 'ok') throw new Error(`could not load ${name}: ${result.status}`)
  return result.document
}

/* ---------------------------------------------------------------- counting */

let copies = 0
let copyThreshold = Number.POSITIVE_INFINITY
const NativeMap = globalThis.Map
class CountingMap<K, V> extends NativeMap<K, V> {
  constructor(entries?: Iterable<readonly [K, V]> | null) {
    super(entries)
    if (this.size >= copyThreshold) copies += 1
  }
}

/** Mean milliseconds per run, and full-board map copies per run. */
async function measure(size: number, run: () => unknown): Promise<{ ms: number; copies: number }> {
  for (let i = 0; i < WARM; i++) await run()
  globalThis.Map = CountingMap
  copyThreshold = size
  copies = 0
  const started = performance.now()
  try {
    for (let i = 0; i < RUNS; i++) await run()
  } finally {
    globalThis.Map = NativeMap
    copyThreshold = Number.POSITIVE_INFINITY
  }
  return { ms: (performance.now() - started) / RUNS, copies: copies / RUNS }
}

/* ------------------------------------------------------------------- peers */

const BOARD = asBoardId('brd_benchmcp000001')

function dispatcherOn(document: BoardDocument) {
  const { store, writer } = createDocumentStore(document)
  const dispatcher = new CommandDispatcher({
    store,
    writer,
    registry,
    clock: fixedClock(1_700_000_000_000),
    ids: createSequentialIdGenerator(),
    capabilities: allowAllCapabilities,
  })
  return { store, dispatcher }
}

/** A peer holding the fixture, with no room: the read tools only need the store. */
function peerOn(document: BoardDocument): BoardPeer {
  const { store, dispatcher } = dispatcherOn(document)
  return {
    boardId: BOARD,
    store,
    dispatcher,
    role: 'editor',
    registry,
    by: 'Benchmark',
    changes: () => [],
    markReverted: () => false,
    close: () => undefined,
  }
}

const account: SignedIn = {
  account: { userId: 'bench', email: 'bench@example.com', displayName: 'Benchmark' },
  boards: () => Promise.resolve([]),
  board: () => Promise.resolve({ boardId: BOARD, title: 'Bench', role: 'editor', accessKey: null }),
  comment: () => Promise.resolve('cmt_bench'),
  close: () => undefined,
}

async function answer(
  tool: typeof getObjects,
  input: Record<string, unknown>,
  context: ReturnType<typeof toolContext>,
): Promise<Record<string, unknown>> {
  const response = await tool.run({ board: BOARD, ...input }, context)
  const json = response.text.slice(response.text.indexOf('{'))
  return JSON.parse(json) as Record<string, unknown>
}

/* ------------------------------------------------------------------- cases */

const sticky = (i: number) => ({ type: 'sticky', x: 50_000 + i * 10, y: 50_000 })

function agentCommands(): Command[] {
  return Array.from({ length: AGENT_BATCH }, (_, i) => ({
    kind: 'CreateObjects',
    objects: [sticky(i)],
  }))
}

/** What the other peers receive for the agent's batch: its patches, as one remote batch. */
function remoteBatch(document: BoardDocument): readonly Patch[] {
  const { dispatcher } = dispatcherOn(document)
  const made = dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: Array.from({ length: AGENT_BATCH }, (_, i) => sticky(i)),
  })
  if (!made.ok) throw made.error
  return made.patches
}

async function bench(name: string): Promise<void> {
  const document = load(name)
  const size = document.objects.size
  const context = toolContext(account, { open: () => Promise.resolve(peerOn(document)) })

  // The cursor ten pages in, taken once, so the timed call only reads.
  let cursor: unknown = undefined
  for (let page = 0; page < 10 && cursor !== null; page++) {
    const body = await answer(getObjects, cursor === undefined ? {} : { cursor }, context)
    cursor = body.next
  }
  const ids = [...document.objects.keys()].slice(0, 50)
  const patches = remoteBatch(document)

  const rows: [string, { ms: number; copies: number }][] = [
    ['get_objects, first page', await measure(size, () => answer(getObjects, {}, context))],
    [
      'get_objects, page 10 by cursor',
      await measure(size, () =>
        answer(getObjects, typeof cursor === 'string' ? { cursor } : {}, context),
      ),
    ],
    [
      'get_objects, every page',
      await measure(size, async () => {
        let next: unknown = undefined
        while (next !== null) {
          const body = await answer(getObjects, next === undefined ? {} : { cursor: next }, context)
          next = body.next
        }
      }),
    ],
    [
      'get_objects, 50 ids (control)',
      await measure(size, () => answer(getObjects, { ids }, context)),
    ],
    [
      'search_board, common word',
      await measure(size, () => answer(searchBoard, { query: 'note' }, context)),
    ],
    [
      'search_board, no match',
      await measure(size, () => answer(searchBoard, { query: 'zzqqxx' }, context)),
    ],
    [
      `agent: ${String(AGENT_BATCH)} commands, one transaction`,
      await measure(size, () => {
        const result = dispatcherOn(document).dispatcher.transact('Agent', agentCommands())
        if (!result.ok) throw result.error
      }),
    ],
    [
      `agent: one command of ${String(AGENT_BATCH)} (control)`,
      await measure(size, () => {
        const result = dispatcherOn(document).dispatcher.dispatch({
          kind: 'CreateObjects',
          objects: Array.from({ length: AGENT_BATCH }, (_, i) => sticky(i)),
        })
        if (!result.ok) throw result.error
      }),
    ],
    [
      `peer: that batch arriving remotely`,
      await measure(size, () => {
        const result = dispatcherOn(document).dispatcher.dispatch(
          { kind: 'ApplyRemotePatches', patches },
          { origin: 'remote', skipUndo: true },
        )
        if (!result.ok) throw result.error
      }),
    ],
  ]

  console.log(`\n${name} — ${String(size)} objects`)
  console.log(`${'case'.padEnd(44)}${'ms'.padStart(10)}${'map copies'.padStart(13)}`)
  for (const [label, { ms, copies: made }] of rows) {
    console.log(`${label.padEnd(44)}${ms.toFixed(2).padStart(10)}${String(made).padStart(13)}`)
  }
}

for (const name of boards) await bench(name)
