import type {
  AnyOpenFrameObject,
  BoardDocument,
  ObjectId,
  ObjectTypeRegistry,
  RelationLink,
} from '@openframe/core'

/**
 * What this object stands on, and what stands on it.
 *
 * ADR 0011 made relations objects with no appearance, which buys clean merges
 * and costs visibility: nothing on the board shows that an insight cites five
 * pieces of evidence. The ADR named this as a debt — "invisible things need a
 * way to be seen", or the model is unfalsifiable by use. This is the payment.
 *
 * Both directions are shown because the two questions are asked by different
 * people. The author of a claim asks what it rests on; someone arriving at a
 * piece of evidence days later asks what was concluded from it — which is the
 * question Phase 1 deferred the whole relation decision on.
 */
export function Provenance({
  doc,
  registry,
  cites,
  citedBy,
  onReveal,
}: {
  readonly doc: BoardDocument
  readonly registry: ObjectTypeRegistry
  readonly cites: readonly RelationLink[]
  readonly citedBy: readonly RelationLink[]
  readonly onReveal: (id: ObjectId) => void
}) {
  if (cites.length === 0 && citedBy.length === 0) return null

  return (
    <>
      <Group
        name="stands on"
        links={cites}
        end={(link) => link.edge.to}
        doc={doc}
        registry={registry}
        onReveal={onReveal}
      />
      <Group
        name="cited by"
        links={citedBy}
        end={(link) => link.edge.from}
        doc={doc}
        registry={registry}
        onReveal={onReveal}
      />
    </>
  )
}

function Group({
  name,
  links,
  end,
  doc,
  registry,
  onReveal,
}: {
  readonly name: string
  readonly links: readonly RelationLink[]
  readonly end: (link: RelationLink) => ObjectId
  readonly doc: BoardDocument
  readonly registry: ObjectTypeRegistry
  readonly onReveal: (id: ObjectId) => void
}) {
  /*
   * Deduplicated by the object at the far end, as ADR 0011 requires on read.
   * Two people adding the same citation concurrently produces two relation
   * objects — benign, and precisely the case the embedded-array model would
   * have lost data on — but the panel must not list the same card twice.
   */
  const seen = new Set<ObjectId>()
  const entries = links
    .map(end)
    .filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map((id) => ({ id, object: doc.objects.get(id) }))
    .filter((entry): entry is { id: ObjectId; object: AnyOpenFrameObject } => {
      return entry.object !== undefined
    })

  if (entries.length === 0) return null

  return (
    <div className="of-field of-field--tall">
      <span className="of-field__label">{name}</span>
      <div className="of-field__control">
        <ul className="of-trail" aria-label={name}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="of-trail__item"
                data-testid={`trail-${entry.id}`}
                /*
                 * Selecting the far end rather than opening anything. The board
                 * is the product: the useful answer to "what does this stand
                 * on?" is to be looking at it, not reading its title in a list.
                 */
                onClick={() => {
                  onReveal(entry.id)
                }}
              >
                {summarise(entry.object, registry)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * Asked of the object's TYPE, not derived here.
 *
 * `describe().summary` is a type's own one-line account of itself, and is
 * already the seam board search, AI context, MCP and export read from. Reaching
 * into `data.text` instead would be a second source of truth that goes blank
 * for any type whose content is not called `text` — an image's alt, a shape's
 * label — which is the drift rule 21 exists to stop.
 */
function summarise(object: AnyOpenFrameObject, registry: ObjectTypeRegistry): string {
  return registry.describeObject(object).summary
}
