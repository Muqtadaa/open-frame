import { childrenOf } from '../../domain/document.js'
import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import { parentageRepairs } from '../../domain/invariants.js'
import type { Patch } from '../../domain/patch.js'
import type { Command } from '../types.js'

type RepairParentage = Extract<Command, { kind: 'RepairParentage' }>

/**
 * Detaches whatever has ended up with impossible parentage, and nothing else.
 *
 * This is the merge counterpart of the repair that runs at load. Two people
 * each dragging A into B and B into A both succeed locally, and the merge has a
 * loop no last-writer-wins register could have prevented. The rule for breaking
 * it lives in `parentageRepairs` so that both clients — and the load-time path —
 * make the identical choice; see the note there for why one implementation
 * matters more than it looks.
 *
 * Unlike `ReparentObjects` this ignores locks. A repair that can be refused is
 * not a repair: a cycle between two locked frames would then be permanent, and
 * the objects inside it unreachable. Restoring an invariant is not an edit the
 * user made, and it is never the thing that costs someone their board.
 */
export function repairParentage(doc: BoardDocument, command: RepairParentage): Patch[] {
  const candidates = new Set<ObjectId>()

  for (const id of command.ids) {
    if (doc.objects.has(id)) {
      candidates.add(id)
      continue
    }
    /*
     * An id that is no longer here is read as a FORMER PARENT, and its orphans
     * are checked in its place. This is the common merge corruption, more so
     * than cycles: you delete a frame at the moment someone else drops a note
     * into it, and the note survives pointing at nothing. Left alone it is
     * invisible — `objectsInPaintOrder` cannot place a child of an object that
     * does not exist — which reads to its owner as lost work.
     *
     * `childrenOf` is the O(n) scan rule 10 warns about, so it is reached only
     * for an id that was actually removed, never per candidate and never per
     * frame.
     */
    for (const orphan of childrenOf(doc, id)) candidates.add(orphan.id)
  }

  return parentageRepairs(doc.objects, candidates).map((repair) => ({
    op: 'set',
    id: repair.objectId,
    path: ['parentId'],
    value: null,
  }))
}
