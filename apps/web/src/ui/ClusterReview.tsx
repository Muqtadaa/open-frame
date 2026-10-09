import type { AnyOpenFrameObject, ObjectId } from '@openframe/core'
import { MIN_CLUSTER_NOTES, type ClusterProposal } from '@openframe/core/ai'
import { useMemo, useState } from 'react'

import { gatherClusterNotes } from '../app/ai-cluster.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { useServices } from '../runtime/services.js'
import { AiSheet, ReviewActions, aiRefusals, notesNoun } from './ai-sheet.js'

const REFUSED = aiRefusals('cluster', MIN_CLUSTER_NOTES)

/**
 * Clustering notes with AI, along the top of the board (ADR 0018): what will
 * be sent and to whom, then the proposal to look over and change before any
 * of it reaches the board. Nothing is written until Apply, and Apply is one
 * change, marked as the AI's.
 */
export function ClusterReview() {
  const ids = useInteractionStore((state) => state.clusterReview)
  if (ids === null) return null
  /*
   * Keyed by what it is about, so opening it on other notes starts it again —
   * and the unmount aborts any request still out. Kept, an answer about the
   * old notes was shown, and applied, with its refs read against the new ones
   * (Codex, on #103).
   */
  return <ClusterPanel key={ids.join(' ')} ids={ids} />
}

function ClusterPanel({ ids }: { readonly ids: readonly ObjectId[] }) {
  const { runtime } = useOpenFrame()
  const services = useServices()
  const commands = useCommands()
  const closePanel = useInteractionStore((state) => state.closeClusterReview)

  // Gathered once, when the panel opens: what is sent is what was selected then.
  const gathered = useMemo(
    () => gatherClusterNotes(runtime.store.getDocument(), runtime.registry, ids),
    [runtime, ids],
  )
  const count = gathered.ok ? gathered.notes.size : 0

  return (
    <AiSheet<ClusterProposal>
      name="cluster"
      heading={`Cluster with AI${count > 0 ? ` · ${notesNoun(count)}` : ''}`}
      verb="Cluster"
      asking={`Clustering ${notesNoun(count)}…`}
      confirm="The notes’ text is sent to Anthropic, and the themes come back here to look over before anything is added."
      refusals={REFUSED}
      refusedAtOpen={gathered.ok ? null : gathered.why}
      ask={async (token, signal) => {
        if (!gathered.ok) return { kind: 'refused', why: 'invalid' }
        const outcome = await services.ai.cluster(gathered.request, token, signal)
        return outcome.kind === 'proposal'
          ? { kind: 'answer', result: outcome.proposal, remaining: outcome.remaining }
          : outcome
      }}
      onClose={closePanel}
      review={(proposal, remaining, close) =>
        gathered.ok && (
          <ProposalForm
            proposal={proposal}
            remaining={remaining}
            notes={gathered.notes}
            onApply={(edited) => {
              if (commands.applyClusterProposal(edited, gathered.notes) !== null) close()
            }}
            onDiscard={close}
          />
        )
      }
    />
  )
}

function ProposalForm({
  proposal,
  remaining,
  notes,
  onApply,
  onDiscard,
}: {
  readonly proposal: ClusterProposal
  readonly remaining: number
  readonly notes: ReadonlyMap<string, AnyOpenFrameObject>
  readonly onApply: (proposal: ClusterProposal) => void
  readonly onDiscard: () => void
}) {
  const { runtime } = useOpenFrame()
  const [title, setTitle] = useState(proposal.title)
  const [labels, setLabels] = useState(() => proposal.clusters.map((cluster) => cluster.label))
  const gist = (ref: string): string => {
    const note = notes.get(ref)
    return note === undefined ? '' : runtime.registry.describeObject(note).gist
  }

  return (
    <form
      className="of-ai-sheet__form"
      onSubmit={(event) => {
        event.preventDefault()
        onApply({
          title: title.trim() === '' ? proposal.title : title.trim(),
          clusters: proposal.clusters.map((cluster, index) => {
            const label = (labels[index] ?? '').trim()
            return { ...cluster, label: label === '' ? cluster.label : label }
          }),
          unassigned: proposal.unassigned,
        })
      }}
    >
      <label className="of-ai-sheet__field">
        <span>Title</span>
        <input
          className="of-input"
          value={title}
          maxLength={80}
          data-testid="cluster-title"
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />
      </label>
      <ol className="of-ai-sheet__items" aria-label="Themes">
        {proposal.clusters.map((cluster, index) => (
          <li key={cluster.refs[0] ?? index} className="of-ai-sheet__item">
            <label className="of-ai-sheet__field">
              <span>
                Theme {String(index + 1)} · {notesNoun(cluster.refs.length)}
              </span>
              <input
                className="of-input"
                value={labels[index] ?? ''}
                maxLength={60}
                data-testid="cluster-label"
                onChange={(event) => {
                  const value = event.target.value
                  setLabels((current) => current.map((old, at) => (at === index ? value : old)))
                }}
              />
            </label>
            {cluster.summary !== '' && <p className="of-ai-sheet__detail">{cluster.summary}</p>}
            <ul className="of-ai-sheet__notes">
              {cluster.refs.map((ref) => (
                <li key={ref} className="of-ai-sheet__gist">
                  {gist(ref)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {/*
        What Apply does, said before it is pressed: the AI's grouping is laid
        out as COPIES, and people deleted their originals to tidy up after it.
      */}
      <p className="of-ai-sheet__note" data-testid="cluster-copies">
        Adds a frame with copies of {notesNoun(notes.size)}; the originals stay
      </p>
      {proposal.unassigned.length > 0 && (
        <p className="of-ai-sheet__note" data-testid="cluster-other">
          Other · {notesNoun(proposal.unassigned.length)}
        </p>
      )}
      <ReviewActions name="cluster" remaining={remaining} onDiscard={onDiscard} />
    </form>
  )
}
