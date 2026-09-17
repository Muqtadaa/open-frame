/**
 * Generates benchmark boards at the scales the architecture is meant to handle
 * gracefully: 100, 1,000, 5,000 and 10,000 objects.
 *
 * These exist so that performance claims are MEASURED rather than asserted. The
 * plan deliberately does not promise an object count — it promises graceful
 * scaling, and the only way to know whether that holds is to open a 10,000
 * object board and look at the numbers in the status bar.
 *
 *   pnpm bench:fixtures
 *   # then load a fixture via the console:
 *   #   await __openframe.runtime.repository.saveBoard(...)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CommandDispatcher,
  allowAllCapabilities,
  asBoardId,
  createDefaultRegistry,
  createDocumentStore,
  createEmptyDocument,
  createSequentialIdGenerator,
  fixedClock,
  serializeBoard,
  type ColorToken,
} from '@openframe/core'

const SIZES = [100, 1_000, 5_000, 10_000] as const
const COLORS: ColorToken[] = ['yellow', 'green', 'blue', 'red', 'violet', 'orange']
/*
 * Written into the web app's public directory so the dev-only fixture loader
 * can simply fetch them. Generated output, gitignored — the generator is the
 * source of truth, not the files.
 */
const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'apps',
  'web',
  'public',
  'bench',
)

/** Deterministic PRNG, so a fixture is byte-identical between runs. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generate(count: number): string {
  const random = mulberry32(count)
  const registry = createDefaultRegistry()
  const { store, writer } = createDocumentStore(
    createEmptyDocument(asBoardId(`bench_${String(count)}`), `Benchmark ${String(count)}`, 0),
  )
  const dispatcher = new CommandDispatcher({
    store,
    writer,
    registry,
    clock: fixedClock(1_700_000_000_000),
    ids: createSequentialIdGenerator(),
    capabilities: allowAllCapabilities,
  })

  // Lay objects out on a loose grid so culling has something realistic to do.
  const columns = Math.ceil(Math.sqrt(count))
  const BATCH = 500
  for (let start = 0; start < count; start += BATCH) {
    const objects = []
    for (let i = start; i < Math.min(start + BATCH, count); i++) {
      objects.push({
        type: 'sticky',
        x: (i % columns) * 220 + Math.floor(random() * 20),
        y: Math.floor(i / columns) * 220 + Math.floor(random() * 20),
        data: { text: `Note ${String(i + 1)}` },
        style: { color: COLORS[Math.floor(random() * COLORS.length)] ?? 'yellow' },
      })
    }
    const result = dispatcher.dispatch({ kind: 'CreateObjects', objects })
    if (!result.ok) throw result.error
  }

  return JSON.stringify(serializeBoard(store.getDocument(), 1_700_000_000_000))
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of SIZES) {
  const started = performance.now()
  const json = generate(size)
  const elapsed = performance.now() - started
  const file = join(OUT_DIR, `board-${String(size)}.json`)
  writeFileSync(file, json)
  console.log(
    `${String(size).padStart(6)} objects  ${(json.length / 1024).toFixed(0).padStart(6)} KB  ` +
      `generated in ${elapsed.toFixed(0)}ms  ->  ${file}`,
  )
}
