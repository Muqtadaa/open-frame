/**
 * What one cull pass costs, by board composition.
 *
 * The browser probe (`pnpm test:bench`) reports FRAME time, which is capped at
 * the display's refresh rate — so it reads 16.7ms whether culling takes 1ms or
 * 15ms, and only moves once the budget is already blown. This measures the pass
 * directly, in Node, which is what makes a regression visible before it becomes
 * a dropped frame.
 *
 * It found one: a group's bounds are its children's, and the obvious
 * implementation scanned the whole document per group, costing 9.6ms per cull on
 * 10,000 objects against a 16.7ms budget.
 *
 *   pnpm bench:fixtures && pnpm bench:cull
 */
import { readFileSync } from 'node:fs'

import { createDefaultRegistry, deserializeBoard, visibleWorldRect } from '@openframe/core'
import type { BoardDocument } from '@openframe/core'

import { cullToViewport } from '../../apps/web/src/scene/culling.js'

const registry = createDefaultRegistry()
const visible = visibleWorldRect({ x: 0, y: 0, zoom: 1 }, 1280, 800)

function load(path: string): BoardDocument {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const result = deserializeBoard(raw, registry)
  if (result.status !== 'ok') throw new Error(`could not load ${path}: ${result.status}`)
  return result.document
}

function timeCull(doc: BoardDocument): number {
  for (let i = 0; i < 5; i++) cullToViewport(doc, registry, visible)
  const runs = 20
  const started = performance.now()
  for (let i = 0; i < runs; i++) cullToViewport(doc, registry, visible)
  return (performance.now() - started) / runs
}

/** The same board with every group dissolved, to attribute the cost. */
function withoutGroups(doc: BoardDocument): BoardDocument {
  const objects = new Map(doc.objects)
  for (const [id, object] of doc.objects) {
    if (object.type === 'group') objects.delete(id)
    else if (object.parentId !== null && doc.objects.get(object.parentId)?.type === 'group') {
      objects.set(id, { ...object, parentId: null })
    }
  }
  return { ...doc, objects }
}

const count = (doc: BoardDocument, type: string): number =>
  [...doc.objects.values()].filter((object) => object.type === type).length

console.log('\n  board             | objects | groups | connectors |    cull | without groups')
console.log('  ------------------|---------|--------|------------|---------|---------------')
for (const name of ['board-1000', 'board-10000', 'board-mixed-1000', 'board-mixed-10000']) {
  const doc = load(`tools/bench/fixtures/${name}.json`)
  console.log(
    `  ${name.padEnd(17)} | ${String(doc.objects.size).padStart(7)} | ` +
      `${String(count(doc, 'group')).padStart(6)} | ${String(count(doc, 'connector')).padStart(10)} | ` +
      `${timeCull(doc).toFixed(2).padStart(6)}ms | ${timeCull(withoutGroups(doc)).toFixed(2).padStart(10)}ms`,
  )
}
console.log()
