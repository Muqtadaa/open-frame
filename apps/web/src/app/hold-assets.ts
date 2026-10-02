import type {
  AnyOpenFrameObject,
  AssetRef,
  BoardDocument,
  DocumentStore,
  ObjectId,
} from '@openframe/core'

/**
 * Every picture on a board, by what its object holds.
 *
 * Asked of the DATA rather than of the type, as `strandedAssets` is: an
 * `asset` field holding a locator is what makes an object a picture worth
 * keeping, and a later type that holds one is kept without naming itself here.
 */
export function assetsOf(document: BoardDocument): readonly AssetRef[] {
  return picturesOf(document).map((picture) => picture.ref)
}

function picturesOf(document: BoardDocument): readonly { objectId: ObjectId; ref: AssetRef }[] {
  const pictures: { objectId: ObjectId; ref: AssetRef }[] = []
  for (const object of document.objects.values()) {
    const ref = assetOf(object)
    if (ref !== undefined) pictures.push({ objectId: object.id, ref })
  }
  return pictures
}

function assetOf(object: AnyOpenFrameObject | undefined): AssetRef | undefined {
  const ref = (object?.data as { asset?: AssetRef } | undefined)?.asset
  return ref === undefined || typeof ref.locator !== 'string' ? undefined : ref
}

/**
 * Keeps this browser holding every picture on a shared board.
 *
 * The board resolves only what is on screen, and a deleted room refuses every
 * request — so the copy somebody keeps of a board deleted under them had a
 * hole wherever a picture had never been scrolled to. Holding them all as the
 * board opens, and as pictures arrive, means this browser's copy is a copy of
 * the pictures too, and the board keeps painting them offline.
 *
 * One at a time, and never awaited by anything: a board with forty
 * photographs must not hold up its first paint, or flood the connection the
 * room is syncing over. Rescanned only when objects appear or disappear, which
 * is the only way a new picture arrives — never per edit, and never per frame
 * (rule 10). A picture the room would not give is asked for again at the next
 * such change, AND when its own locator changes: one placed while its upload
 * failed is published later by rewriting that field alone, which is an edit
 * rather than an arrival. Only the pictures still missing are watched, each on
 * its own object's channel, so no edit anywhere else costs anything.
 */
export function holdAssets(
  store: Pick<
    DocumentStore,
    'getDocument' | 'getObject' | 'subscribeToStructure' | 'subscribeToObject'
  >,
  hold: (ref: AssetRef) => Promise<boolean>,
): () => void {
  const held = new Set<string>()
  const queued = new Set<string>()
  const queue: { objectId: ObjectId; ref: AssetRef }[] = []
  const watching = new Map<ObjectId, () => void>()
  let running = false
  let stopped = false

  const unwatch = (objectId: ObjectId): void => {
    watching.get(objectId)?.()
    watching.delete(objectId)
  }

  const enqueue = (picture: { objectId: ObjectId; ref: AssetRef }): void => {
    if (held.has(picture.ref.id) || queued.has(picture.ref.id)) return
    queued.add(picture.ref.id)
    queue.push(picture)
  }

  /** Waits for a missing picture's locator to change, then asks again. */
  const watch = (objectId: ObjectId, missing: AssetRef): void => {
    if (watching.has(objectId)) return
    watching.set(
      objectId,
      store.subscribeToObject(objectId, () => {
        const now = assetOf(store.getObject(objectId))
        if (now === undefined) return unwatch(objectId)
        if (now.locator === missing.locator) return
        unwatch(objectId)
        enqueue({ objectId, ref: now })
        void drain()
      }),
    )
  }

  const drain = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      for (let next = queue.shift(); next !== undefined && !stopped; next = queue.shift()) {
        const here = await hold(next.ref).catch(() => false)
        queued.delete(next.ref.id)
        if (stopped) break
        if (here) {
          held.add(next.ref.id)
          unwatch(next.objectId)
        } else {
          watch(next.objectId, next.ref)
        }
      }
    } finally {
      running = false
    }
  }

  const scan = (): void => {
    for (const picture of picturesOf(store.getDocument())) enqueue(picture)
    void drain()
  }

  const unsubscribe = store.subscribeToStructure(scan)
  scan()
  return () => {
    stopped = true
    unsubscribe()
    for (const objectId of [...watching.keys()]) unwatch(objectId)
  }
}
