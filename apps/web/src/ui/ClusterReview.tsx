import type { AnyOpenFrameObject, ObjectId } from '@openframe/core'
import { MIN_CLUSTER_NOTES, type ClusterProposal } from '@openframe/core/ai'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { gatherClusterNotes } from '../app/ai-cluster.js'
import { wrapTab } from '../controls/wrap-tab.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { useServices, type ClusterRefusal } from '../runtime/services.js'
import { focusTheBoard } from './hand-back-focus.js'

/** What each refusal says. Facts, and the one thing that would change it. */
const REFUSED: Readonly<Record<ClusterRefusal | 'too-few' | 'too-many', string>> = {
  'signed-out': 'AI needs an account',
  unconfigured: 'AI is not set up on this server',
  'too-large': 'Too much text to send at once',
  'too-many': 'Too many notes to send at once',
  'too-few': `Clustering takes at least ${String(MIN_CLUSTER_NOTES)} notes with text`,
  invalid: 'The answer did not match the notes',
  unreachable: 'The AI could not be reached',
  limit: 'No AI runs left today',
  declined: 'The AI declined to cluster these notes',
  failed: 'The AI did not finish',
}

type Stage =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'review'; readonly proposal: ClusterProposal; readonly remaining: number }
  | { readonly kind: 'refused'; readonly why: keyof typeof REFUSED }

/**
 * Clustering notes with AI, along the top of the board (ADR 0018): what will
 * be sent and to whom, then the proposal to look over and change before any
 * of it reaches the board. Nothing is written until Apply, and Apply is one
 * change, marked as the AI's.
 */
export function ClusterReview() {
  const ids = useInteractionStore((state) => state.clusterReview)
  if (ids === null) return null
  return <ClusterPanel ids={ids} />
}

function ClusterPanel({ ids }: { readonly ids: readonly ObjectId[] }) {
  const { runtime } = useOpenFrame()
  const services = useServices()
  const commands = useCommands()
  const closePanel = useInteractionStore((state) => state.closeClusterReview)
  /*
   * Closing hands the keyboard to the board — the selection, or after Apply
   * the new frame — rather than dropping it on the page with the panel.
   */
  const close = useCallback(() => {
    closePanel()
    focusTheBoard()
  }, [closePanel])

  /*
   * Escape closes the panel from ANYWHERE while it is open, and only the
   * panel. Heard only inside it, an Escape pressed once focus had moved to the
   * board went to the keymap instead: the selection was cleared and the panel
   * stayed open, describing notes that were no longer selected.
   */
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('keydown', escape, true)
    }
  }, [close])
  const headingId = useId()
  const panel = useRef<HTMLElement>(null)
  const asking = useRef<AbortController | null>(null)

  // Gathered once, when the panel opens: what is sent is what was selected then.
  const gathered = useMemo(
    () => gatherClusterNotes(runtime.store.getDocument(), runtime.registry, ids),
    [runtime, ids],
  )
  const [stage, setStage] = useState<Stage>(
    gathered.ok ? { kind: 'confirm' } : { kind: 'refused', why: gathered.why },
  )

  // Each stage puts the keyboard on its first control.
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input, button')?.focus()
  }, [stage.kind])

  // Closing while asking stops the request; nothing comes back to apply.
  useEffect(
    () => () => {
      asking.current?.abort()
    },
    [],
  )

  const count = gathered.ok ? gathered.notes.size : 0
  const noun = count === 1 ? 'note' : 'notes'

  const ask = async (): Promise<void> => {
    /*
     * Busy, and cancellable, BEFORE the first await. The account lookup is a
     * wait during which the Cluster button was still there: a double-click
     * asked twice and spent two runs, and closing the panel mid-lookup could
     * not stop a request whose controller did not exist yet (Codex, on #67).
     */
    if (!gathered.ok || asking.current !== null) return
    const controller = new AbortController()
    asking.current = controller
    setStage({ kind: 'asking' })
    try {
      const identity = services.accounts.enabled ? await services.accounts.current() : null
      if (controller.signal.aborted) return
      if (identity === null) {
        setStage({ kind: 'refused', why: 'signed-out' })
        return
      }
      const outcome = await services.ai.cluster(
        gathered.request,
        identity.accessToken,
        controller.signal,
      )
      if (controller.signal.aborted) return
      setStage(
        outcome.kind === 'proposal'
          ? { kind: 'review', proposal: outcome.proposal, remaining: outcome.remaining }
          : { kind: 'refused', why: outcome.why },
      )
    } catch {
      // Aborted: the panel is closing, and there is nothing to say.
    } finally {
      if (asking.current === controller) asking.current = null
    }
  }

  return (
    <section
      ref={panel}
      className="of-notice of-cluster"
      aria-labelledby={headingId}
      data-testid="cluster-review"
      data-stage={stage.kind}
      onKeyDown={(event) => {
        wrapTab(event)
        /*
         * Enter and Space press the button the panel put focus on. The board's
         * keymap yields them to a control only when the KEYBOARD put focus
         * there, and this panel is usually opened with a pointer — so Enter
         * went to the board, as "edit the selection", and nothing was pressed.
         */
        if (
          (event.key === 'Enter' || event.key === ' ') &&
          event.target instanceof HTMLButtonElement
        ) {
          event.stopPropagation()
        }
      }}
    >
      <h2 className="of-cluster__heading" id={headingId}>
        Cluster with AI{count > 0 ? ` · ${String(count)} ${noun}` : ''}
      </h2>

      {stage.kind === 'confirm' && (
        <>
          <p className="of-cluster__note">
            The notes’ text is sent to Anthropic, and the themes come back here to look over before
            anything is added.
          </p>
          <div className="of-cluster__actions">
            <button
              type="button"
              className="of-button of-button--primary"
              data-testid="cluster-ask"
              onClick={() => {
                void ask()
              }}
            >
              Cluster
            </button>
            <button type="button" className="of-button of-button--ghost" onClick={close}>
              Cancel
            </button>
          </div>
        </>
      )}

      {stage.kind === 'asking' && (
        <>
          <p className="of-cluster__note" role="status">
            Clustering {String(count)} {noun}…
          </p>
          <div className="of-cluster__actions">
            <button type="button" className="of-button of-button--ghost" onClick={close}>
              Cancel
            </button>
          </div>
        </>
      )}

      {stage.kind === 'refused' && (
        <>
          <p className="of-cluster__note" role="alert" data-testid="cluster-refused">
            {REFUSED[stage.why]}
          </p>
          <div className="of-cluster__actions">
            <button type="button" className="of-button of-button--ghost" onClick={close}>
              Close
            </button>
          </div>
        </>
      )}

      {stage.kind === 'review' && gathered.ok && (
        <ProposalForm
          proposal={stage.proposal}
          remaining={stage.remaining}
          notes={gathered.notes}
          onApply={(proposal) => {
            if (commands.applyClusterProposal(proposal, gathered.notes) !== null) close()
          }}
          onDiscard={close}
        />
      )}
    </section>
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
      className="of-cluster__form"
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
      <label className="of-cluster__field">
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
      <ol className="of-cluster__themes" aria-label="Themes">
        {proposal.clusters.map((cluster, index) => (
          <li key={cluster.refs[0] ?? index} className="of-cluster__theme">
            <label className="of-cluster__field">
              <span>
                Theme {String(index + 1)} · {String(cluster.refs.length)}{' '}
                {cluster.refs.length === 1 ? 'note' : 'notes'}
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
            {cluster.summary !== '' && <p className="of-cluster__summary">{cluster.summary}</p>}
            <ul className="of-cluster__notes">
              {cluster.refs.map((ref) => (
                <li key={ref} className="of-cluster__gist">
                  {gist(ref)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {proposal.unassigned.length > 0 && (
        <p className="of-cluster__note" data-testid="cluster-other">
          Other · {String(proposal.unassigned.length)}{' '}
          {proposal.unassigned.length === 1 ? 'note' : 'notes'}
        </p>
      )}
      <div className="of-cluster__actions">
        <button type="submit" className="of-button of-button--primary" data-testid="cluster-apply">
          Apply
        </button>
        <button type="button" className="of-button of-button--ghost" onClick={onDiscard}>
          Discard
        </button>
        <span className="of-cluster__remaining" data-testid="cluster-remaining">
          {String(remaining)} {remaining === 1 ? 'run' : 'runs'} left today
        </span>
      </div>
    </form>
  )
}
