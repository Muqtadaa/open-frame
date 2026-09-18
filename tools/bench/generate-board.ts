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
  richFromPlain,
  serializeBoard,
  type ColorToken,
} from '@openframe/core'

/*
 * `pnpm bench:fixtures 60` generates one small pair instead of the full set.
 *
 * `pnpm verify` runs exactly that, because this file goes through the command
 * layer and every schema in the registry — so it breaks whenever a type
 * changes, and it broke silently when `text` became a list of spans. Nothing
 * noticed: verify never ran it, and `build:bench` only runs when
 * OPENFRAME_BENCH=1, which production correctly has set to 0. A build path
 * nothing exercises is a build path that is already broken.
 */
const ARGUMENT = Number(process.argv[2])
const SIZES = Number.isFinite(ARGUMENT) && ARGUMENT > 0 ? ([ARGUMENT] as const) : ([100, 1_000, 5_000, 10_000] as const)
const COLORS: ColorToken[] = ['yellow', 'green', 'blue', 'red', 'violet', 'orange']
/** Spread across the kinds so the mixed board exercises several label insets. */
const SHAPES = ['rectangle', 'ellipse', 'triangle', 'diamond', 'hexagon'] as const
/*
 * Deliberately NOT in the web app's `public/` directory: everything there is
 * copied into every production build, and 4.7MB of benchmark boards shipping to
 * real users is exactly the kind of thing nobody notices until it is deployed.
 * A Vite plugin serves this directory at /bench in dev, and copies it into the
 * bundle only for an explicit benchmark build.
 */
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

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

/**
 * A board of nothing but sticky notes.
 *
 * Kept as the baseline because every earlier measurement used it, so the
 * numbers stay comparable. It is NOT representative: a sticky's bounds are its
 * frame, which is the cheapest case there is.
 */
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
        data: { text: richFromPlain(`Note ${String(i + 1)}`) },
        style: { color: COLORS[Math.floor(random() * COLORS.length)] ?? 'yellow' },
      })
    }
    const result = dispatcher.dispatch({ kind: 'CreateObjects', objects })
    if (!result.ok) throw result.error
  }

  return JSON.stringify(serializeBoard(store.getDocument(), 1_700_000_000_000))
}

/**
 * A board with the geometry that actually costs something.
 *
 * The sticky-only fixture exercises the cheapest possible bounds calculation —
 * read four numbers off the frame — so a flat frame time on it says the renderer
 * scales for the ONE type whose cost was never in question. Connectors resolve
 * their endpoints through the document on every bounds call, and a group's
 * bounds are the union of its children's. Those are the paths worth measuring,
 * and until this fixture existed nothing did.
 *
 * Composition is roughly what a real diagram looks like rather than a worst
 * case: mostly leaf objects, a minority of containers and connectors.
 */
function generateMixed(count: number): string {
  const random = mulberry32(count * 7 + 1)
  const registry = createDefaultRegistry()
  const { store, writer } = createDocumentStore(
    createEmptyDocument(asBoardId(`bench_mixed_${String(count)}`), `Mixed ${String(count)}`, 0),
  )
  const dispatcher = new CommandDispatcher({
    store,
    writer,
    registry,
    clock: fixedClock(1_700_000_000_000),
    ids: createSequentialIdGenerator(),
    capabilities: allowAllCapabilities,
  })

  const columns = Math.ceil(Math.sqrt(count))
  const at = (i: number) => ({
    x: (i % columns) * 220 + Math.floor(random() * 20),
    y: Math.floor(i / columns) * 220 + Math.floor(random() * 20),
  })

  const leaves: string[] = []
  const BATCH = 500

  // Groups of four notes, so a tenth of the board sits behind a container whose
  // bounds are computed from its children.
  const groupCount = Math.floor(count / 40)
  for (let g = 0; g < groupCount; g++) {
    const groupId = `obj_bench_group_${String(g)}` as never
    const base = g * 4
    const result = dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [
        { type: 'group', id: groupId, x: 0, y: 0 },
        ...[0, 1, 2, 3].map((k) => ({
          type: 'sticky',
          parentId: groupId,
          ...at(base + k),
          data: { text: richFromPlain(`Grouped ${String(base + k)}`) },
        })),
      ],
    })
    if (!result.ok) throw result.error
    leaves.push(...result.affected.slice(1))
  }

  // The remainder: stickies and shapes, laid out on the same loose grid.
  const placed = groupCount * 4
  const connectorCount = Math.floor(count / 10)
  const remaining = count - placed - connectorCount
  for (let start = 0; start < remaining; start += BATCH) {
    const objects = []
    for (let i = start; i < Math.min(start + BATCH, remaining); i++) {
      const index = placed + i
      objects.push(
        i % 4 === 0
          ? {
              type: 'shape',
              ...at(index),
              data: { shape: SHAPES[index % SHAPES.length] ?? 'rectangle', text: richFromPlain('') },
              style: { color: COLORS[Math.floor(random() * COLORS.length)] ?? 'yellow' },
            }
          : {
              type: 'sticky',
              ...at(index),
              data: { text: richFromPlain(`Note ${String(index)}`) },
              style: { color: COLORS[Math.floor(random() * COLORS.length)] ?? 'yellow' },
            },
      )
    }
    const result = dispatcher.dispatch({ kind: 'CreateObjects', objects })
    if (!result.ok) throw result.error
    leaves.push(...result.affected)
  }

  // Connectors joining NEARBY objects, so they are culled in and out together
  // rather than spanning the whole board and always being visible.
  for (let start = 0; start < connectorCount; start += BATCH) {
    const objects = []
    for (let i = start; i < Math.min(start + BATCH, connectorCount); i++) {
      const a = leaves[(i * 9) % leaves.length]
      const b = leaves[(i * 9 + 1) % leaves.length]
      if (a === undefined || b === undefined) continue
      objects.push({
        type: 'connector',
        x: 0,
        y: 0,
        data: {
          from: { kind: 'object', objectId: a, anchor: { kind: 'auto' } },
          to: { kind: 'object', objectId: b, anchor: { kind: 'auto' } },
        },
      })
    }
    if (objects.length > 0) {
      const result = dispatcher.dispatch({ kind: 'CreateObjects', objects })
      if (!result.ok) throw result.error
    }
  }

  /*
   * Relations, because ADR 0011 says the index that answers "what cites this?"
   * gets CHECKED at scale rather than assumed — and because a board of 500
   * evidence items clustered into 40 insights carries more relations than
   * objects, which is the case that would make a naive reverse lookup hurt.
   *
   * They are also the one thing on this board with no geometry, so they prove
   * the culling, hit-testing and marquee exclusions hold under load rather than
   * only in a three-object unit test.
   */
  const relationCount = Math.floor(count / 5)
  for (let start = 0; start < relationCount; start += BATCH) {
    const objects = []
    for (let i = start; i < Math.min(start + BATCH, relationCount); i++) {
      const from = leaves[(i * 13) % leaves.length]
      const to = leaves[(i * 13 + 3) % leaves.length]
      if (from === undefined || to === undefined || from === to) continue
      objects.push({ type: 'relation', x: 0, y: 0, data: { from, to, predicate: 'cites' } })
    }
    if (objects.length > 0) {
      const result = dispatcher.dispatch({ kind: 'CreateObjects', objects })
      if (!result.ok) throw result.error
    }
  }

  return JSON.stringify(serializeBoard(store.getDocument(), 1_700_000_000_000))
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [label, build] of [
  ['board', generate],
  ['board-mixed', generateMixed],
] as const) {
  for (const size of SIZES) {
    const started = performance.now()
    const json = build(size)
    const elapsed = performance.now() - started
    const file = join(OUT_DIR, `${label}-${String(size)}.json`)
    writeFileSync(file, json)
    console.log(
      `${label.padEnd(11)} ${String(size).padStart(6)} objects  ` +
        `${(json.length / 1024).toFixed(0).padStart(6)} KB  ` +
        `generated in ${elapsed.toFixed(0)}ms`,
    )
  }
}
