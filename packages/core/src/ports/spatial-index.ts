import { intersects, type Rect } from '../geometry/rect.js'
import type { ObjectId } from '../domain/ids.js'

/**
 * Which objects are in a region.
 *
 * An INTERFACE with a naive implementation, rather than a real spatial index.
 * Linear scanning is entirely adequate to roughly a thousand objects, and
 * building an R-tree before profiling says so is the premature optimisation the
 * architecture explicitly rejects. What matters is that every caller already
 * goes through this interface, so replacing the implementation with `flatbush`
 * or `rbush` later is one file and no call-site changes.
 */
export interface SpatialIndex {
  insert(id: ObjectId, bounds: Rect): void
  update(id: ObjectId, bounds: Rect): void
  remove(id: ObjectId): void
  clear(): void
  /** Ids whose bounds intersect `region`. Order is unspecified. */
  search(region: Rect): ObjectId[]
  readonly size: number
}

export class LinearSpatialIndex implements SpatialIndex {
  readonly #bounds = new Map<ObjectId, Rect>()

  insert(id: ObjectId, bounds: Rect): void {
    this.#bounds.set(id, bounds)
  }

  update(id: ObjectId, bounds: Rect): void {
    this.#bounds.set(id, bounds)
  }

  remove(id: ObjectId): void {
    this.#bounds.delete(id)
  }

  clear(): void {
    this.#bounds.clear()
  }

  search(region: Rect): ObjectId[] {
    const found: ObjectId[] = []
    for (const [id, bounds] of this.#bounds) {
      if (intersects(region, bounds)) found.push(id)
    }
    return found
  }

  get size(): number {
    return this.#bounds.size
  }
}
