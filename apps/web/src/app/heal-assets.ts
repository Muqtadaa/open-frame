import type { AssetRef, BoardDocument, ObjectId } from '@openframe/core'

import { isLocalOnly } from '../adapters/room/room-asset-store.js'

/**
 * Images that are still only in this browser, and the objects holding them.
 *
 * Every picture placed before the room could serve them carries a local
 * locator, which means it is invisible to everybody else. So does one whose
 * upload failed — the store deliberately keeps the local locator when the
 * network refuses, so that this pass is also the retry.
 *
 * Pure, and separate from the running of it, because "which objects need
 * lifting" is the part worth testing and "await a network call in a loop" is
 * not.
 */
export interface StrandedAsset {
  readonly objectId: ObjectId
  readonly ref: AssetRef
}

export function strandedAssets(document: BoardDocument): readonly StrandedAsset[] {
  const stranded: StrandedAsset[] = []
  for (const object of document.objects.values()) {
    /*
     * Asked of the DATA rather than of the type. An `asset` field holding a
     * locator is what makes something liftable, and a later type that holds
     * one gets this without naming itself here — which is the same reason
     * nothing else in this app switches on `object.type`.
     */
    const ref = (object.data as { asset?: AssetRef }).asset
    if (ref === undefined || typeof ref.locator !== 'string') continue
    if (!isLocalOnly(ref)) continue
    stranded.push({ objectId: object.id, ref })
  }
  return stranded
}

/**
 * Lifts every stranded image into the room, and points its object at the copy.
 *
 * Silent on purpose. The person opening the board did not ask for this and
 * cannot act on any part of it — it is repair of a state that should never
 * have existed, and a notice about it would be an apology nobody can accept.
 *
 * Failures are skipped rather than reported for the same reason: an image
 * whose bytes are in somebody else's browser cannot be lifted from this one,
 * and that is not an error, it is the normal state of a board somebody else
 * built. The locator stays local, and whoever has the bytes heals it when
 * they next open the board.
 */
export interface HealDeps {
  readonly resolve: (ref: AssetRef) => Promise<string>
  readonly reupload: (ref: AssetRef, blob: Blob) => Promise<AssetRef>
  readonly rewrite: (objectId: ObjectId, asset: AssetRef) => void
  readonly fetch?: typeof globalThis.fetch
}

export async function healAssets(document: BoardDocument, deps: HealDeps): Promise<number> {
  const stranded = strandedAssets(document)
  if (stranded.length === 0) return 0

  const request = deps.fetch ?? globalThis.fetch.bind(globalThis)
  let lifted = 0

  for (const { objectId, ref } of stranded) {
    try {
      /*
       * Through `resolve` and back through `fetch`, rather than widening the
       * asset port with a "give me the bytes" method. The port has three
       * members and each one is needed by the render path; a fourth that
       * exists for one repair pass would be carried by every adapter forever.
       */
      const url = await deps.resolve(ref)
      const blob = await (await request(url)).blob()
      const next = await deps.reupload(ref, blob)
      if (isLocalOnly(next)) continue
      deps.rewrite(objectId, next)
      lifted += 1
    } catch {
      // Not in this browser, or the room would not take it. Either way the
      // locator stays as it is and the next person who has the bytes tries.
    }
  }

  return lifted
}
