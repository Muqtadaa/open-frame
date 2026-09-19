import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'

type ApplyRemotePatches = Extract<Command, { kind: 'ApplyRemotePatches' }>

/**
 * The one command that carries patches instead of intent.
 *
 * It exists because a change arriving from another person is already a change:
 * it was produced by a command on their machine, validated there, and merged by
 * the CRDT. There is no intent left to re-derive, and re-deriving one would mean
 * guessing which command a diff came from.
 *
 * It stays inside rule 3 rather than around it. `DocumentWriter` is still held
 * only by the composition root, remote changes still take the authorization,
 * history and notification path every other change takes, and `ctx.origin` is
 * checked so that nothing in the UI can reach this to skip the command layer —
 * a component holding a dispatcher cannot summon `origin: 'remote'` by accident.
 *
 * What it does NOT do is validate the incoming objects. That is deliberate and
 * it is Stage 2's decision, recorded in the phase plan: until there is a
 * transport there is no untrusted peer, and a guard built now would be a guard
 * never run against the thing it defends.
 */
export function applyRemotePatches(
  doc: BoardDocument,
  command: ApplyRemotePatches,
  ctx: CommandContext,
): Patch[] {
  if (ctx.origin !== 'remote') {
    throw new CommandError(
      'invalid-input',
      'ApplyRemotePatches is only for changes arriving from another client',
    )
  }

  /*
   * Which objects exist, tracked as the batch is walked so that patches later in
   * the batch are judged against what the earlier ones did.
   *
   * The filtering below is the whole job. `applyPatches` THROWS on a `remove` or
   * a `set` addressing an object that is not there, which is right for a local
   * command — the handler validated against a document that contained it — and
   * wrong for a merge, where "someone deleted it while your edit was in flight"
   * is an ordinary outcome. An unfiltered batch would take down the sync loop
   * over a race the model is designed to have.
   */
  const present = new Set(doc.objects.keys())
  const patches: Patch[] = []

  for (const patch of command.patches) {
    switch (patch.op) {
      case 'add':
        patches.push(patch)
        present.add(patch.id)
        break
      case 'remove':
        if (!present.has(patch.id)) break
        patches.push(patch)
        present.delete(patch.id)
        break
      case 'set':
        if (!present.has(patch.id)) break
        patches.push(patch)
        break
      /*
       * The document's own fields, which no object can be missing. There is
       * nothing to filter: a rename applies whatever happened to the objects.
       */
      case 'meta':
        patches.push(patch)
        break
      default:
        /*
         * Exhaustive on purpose. A `switch` that merely falls through would
         * have dropped a whole operation silently, which is exactly what it
         * did: `meta` arrived, matched nothing, and every remote rename
         * vanished here with no error anywhere. The next operation added to
         * `Patch` fails to compile instead.
         */
        return assertNever(patch)
    }
  }

  return patches
}

function assertNever(patch: never): never {
  throw new CommandError(
    'invalid-input',
    `A patch operation this version does not know arrived from another client: ${JSON.stringify(patch)}`,
  )
}
