import type { AssetRef, BoardDocument, DocumentStore } from '@openframe/core'

/**
 * Every picture on a board, by what its object holds.
 *
 * Asked of the DATA rather than of the type, as `strandedAssets` is: an
 * `asset` field holding a locator is what makes an object a picture worth
 * keeping, and a later type that holds one is kept without naming itself here.
 */
export function assetsOf(document: BoardDocument): readonly AssetRef[] {
  const refs: AssetRef[] = []
  for (const object of document.objects.values()) {
    const ref = (object.data as { asset?: AssetRef }).asset
    if (ref === undefined || typeof ref.locator !== 'string') continue
    refs.push(ref)
  }
  return refs
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
 * such change, since whoever placed it may have published it since.
 */
export function holdAssets(
  store: Pick<DocumentStore, 'getDocument' | 'subscribeToStructure'>,
  hold: (ref: AssetRef) => Promise<boolean>,
): () => void {
  const held = new Set<string>()
  const queued = new Set<string>()
  const queue: AssetRef[] = []
  let running = false
  let stopped = false

  const drain = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      for (let ref = queue.shift(); ref !== undefined && !stopped; ref = queue.shift()) {
        const here = await hold(ref).catch(() => false)
        queued.delete(ref.id)
        if (here) held.add(ref.id)
      }
    } finally {
      running = false
    }
  }

  const scan = (): void => {
    for (const ref of assetsOf(store.getDocument())) {
      if (held.has(ref.id) || queued.has(ref.id)) continue
      queued.add(ref.id)
      queue.push(ref)
    }
    void drain()
  }

  const unsubscribe = store.subscribeToStructure(scan)
  scan()
  return () => {
    stopped = true
    unsubscribe()
  }
}
