import type { BoardDocument } from '../../domain/document.js'
import { setIn, type Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import { readRemoteObject } from './remote-object.js'
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
 * It DOES validate the incoming objects, as of 2026-09-19. That was deferred on
 * the grounds that until there was a transport there was no untrusted peer, and
 * a guard built then would be one never run against the thing it defends. There
 * is a peer now: anyone holding a board's edit link can put arbitrary JSON into
 * the shared map, and until this it went straight into the document.
 *
 * Anything that fails is DROPPED, not repaired and never thrown. A
 * half-understood object is worse than an absent one, and a single bad object
 * from one peer must not take down the sync loop for everybody.
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
   * What the board WOULD look like as the batch is walked, so that patches
   * later in it are judged against what the earlier ones did.
   *
   * It held ids alone until the validation below needed the objects
   * themselves: a `set` on something an earlier patch in the same batch added
   * is not in `doc.objects` yet, because nothing has been applied. Reading the
   * document there dropped every such patch — one test said so immediately.
   *
   * The filtering below is the whole job. `applyPatches` THROWS on a `remove` or
   * a `set` addressing an object that is not there, which is right for a local
   * command — the handler validated against a document that contained it — and
   * wrong for a merge, where "someone deleted it while your edit was in flight"
   * is an ordinary outcome. An unfiltered batch would take down the sync loop
   * over a race the model is designed to have.
   */
  const known = new Map(doc.objects)
  const patches: Patch[] = []

  for (const patch of command.patches) {
    switch (patch.op) {
      case 'add': {
        /*
         * A whole object from somewhere else. This is the widest door in the
         * application and it was unguarded: an object claiming a type this
         * build has never heard of, or a `frame.width` of `"wide"`, went into
         * the document and out to every view that reads it.
         */
        const object = readRemoteObject(patch.object, ctx.registry)
        if (object === null) break
        patches.push({ op: 'add', id: patch.id, object })
        known.set(patch.id, object)
        break
      }
      case 'remove':
        if (!known.has(patch.id)) break
        patches.push(patch)
        known.delete(patch.id)
        break
      case 'set': {
        const current = known.get(patch.id)
        if (current === undefined) break

        /*
         * Checked by APPLYING it and validating the result, because a `set`
         * says nothing about itself: `{ path: ['frame','width'], value: 'wide' }`
         * is a well-formed patch carrying a value that would break every
         * consumer of a frame. The object it lands on is the only thing that
         * can say whether it is legal.
         *
         * The candidate is thrown away either way — this decides whether to
         * pass the PATCH on, so the document is still changed by the patch
         * pipeline like every other change rather than by a value computed
         * here.
         */
        const candidate = setIn(current, patch.path, patch.value)
        const checked = readRemoteObject(candidate, ctx.registry)
        if (checked === null) break

        patches.push(patch)
        // Carried forward, so a second `set` on the same object in this batch
        // is judged against the first one's result rather than against the
        // document it has not reached yet.
        known.set(patch.id, checked)
        break
      }
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
