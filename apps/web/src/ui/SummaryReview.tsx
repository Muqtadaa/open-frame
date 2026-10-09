import type { AnyOpenFrameObject, ObjectId } from '@openframe/core'
import { MIN_SUMMARY_NOTES, type Summary } from '@openframe/core/ai'
import { useMemo, useState } from 'react'

import { gatherSummaryNotes } from '../app/ai-summary.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { useServices } from '../runtime/services.js'
import { AiSheet, ReviewActions, aiRefusals, notesNoun } from './ai-sheet.js'

const REFUSED = aiRefusals('summarise', MIN_SUMMARY_NOTES)

/**
 * Summarising notes with AI, along the top of the board (ADR 0022): the
 * selection, or a frame and everything in it, sent to be summarised; the title
 * and points to look over and change; then one text box beside what was
 * summarised, citing the notes each point rests on. Nothing is written until
 * Apply, and Apply is one change, marked as the AI's.
 */
export function SummaryReview() {
  const ids = useInteractionStore((state) => state.summaryReview)
  if (ids === null) return null
  return <SummaryPanel ids={ids} />
}

function SummaryPanel({ ids }: { readonly ids: readonly ObjectId[] }) {
  const { runtime } = useOpenFrame()
  const services = useServices()
  const commands = useCommands()
  const closePanel = useInteractionStore((state) => state.closeSummaryReview)

  // Gathered once, when the panel opens: what is sent is what was chosen then.
  const gathered = useMemo(
    () => gatherSummaryNotes(runtime.store.getDocument(), runtime.registry, ids),
    [runtime, ids],
  )
  const count = gathered.ok ? gathered.notes.size : 0
  const of =
    gathered.ok && gathered.request.frame !== undefined ? ` of ${gathered.request.frame}` : ''

  return (
    <AiSheet<Summary>
      name="summary"
      heading={`Summarise with AI${count > 0 ? ` · ${notesNoun(count)}` : ''}`}
      verb="Summarise"
      asking={`Summarising ${notesNoun(count)}${of}…`}
      confirm="The notes’ text is sent to Anthropic, and the summary comes back here to look over before anything is added."
      refusals={REFUSED}
      refusedAtOpen={gathered.ok ? null : gathered.why}
      ask={async (token, signal) => {
        if (!gathered.ok) return { kind: 'refused', why: 'invalid' }
        const outcome = await services.ai.summarise(gathered.request, token, signal)
        return outcome.kind === 'summary'
          ? { kind: 'answer', result: outcome.summary, remaining: outcome.remaining }
          : outcome
      }}
      onClose={closePanel}
      review={(summary, remaining, close) =>
        gathered.ok && (
          <SummaryForm
            summary={summary}
            remaining={remaining}
            notes={gathered.notes}
            onApply={(edited) => {
              if (commands.applySummary(edited, gathered.notes, ids) !== null) close()
            }}
            onDiscard={close}
          />
        )
      }
    />
  )
}

function SummaryForm({
  summary,
  remaining,
  notes,
  onApply,
  onDiscard,
}: {
  readonly summary: Summary
  readonly remaining: number
  readonly notes: ReadonlyMap<string, AnyOpenFrameObject>
  readonly onApply: (summary: Summary) => void
  readonly onDiscard: () => void
}) {
  const { runtime } = useOpenFrame()
  const [title, setTitle] = useState(summary.title)
  const [points, setPoints] = useState(() => summary.points.map((point) => point.text))
  const gist = (ref: string): string => {
    const note = notes.get(ref)
    return note === undefined ? '' : runtime.registry.describeObject(note).gist
  }
  const cited = new Set(summary.points.flatMap((point) => point.refs)).size

  return (
    <form
      className="of-ai-sheet__form"
      onSubmit={(event) => {
        event.preventDefault()
        /*
         * A point emptied is a point taken out — the one way to drop what the
         * AI got wrong without a second control per row. Emptying them all
         * would leave a heading over nothing, so that keeps what came back.
         */
        const kept = summary.points
          .map((point, index) => ({ ...point, text: (points[index] ?? '').trim() }))
          .filter((point) => point.text !== '')
        onApply({
          title: title.trim() === '' ? summary.title : title.trim(),
          points: kept.length === 0 ? summary.points : kept,
        })
      }}
    >
      <label className="of-ai-sheet__field">
        <span>Title</span>
        <input
          className="of-input"
          value={title}
          maxLength={80}
          data-testid="summary-title"
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />
      </label>
      <ol className="of-ai-sheet__items" aria-label="Points">
        {summary.points.map((point, index) => (
          <li key={index} className="of-ai-sheet__item">
            <label className="of-ai-sheet__field">
              <span>
                Point {String(index + 1)}
                {point.refs.length > 0 ? ` · cites ${notesNoun(point.refs.length)}` : ''}
              </span>
              <textarea
                className="of-input"
                rows={2}
                value={points[index] ?? ''}
                maxLength={240}
                data-testid="summary-point"
                onChange={(event) => {
                  const value = event.target.value
                  setPoints((current) => current.map((old, at) => (at === index ? value : old)))
                }}
              />
            </label>
            {point.refs.length > 0 && (
              <ul className="of-ai-sheet__notes">
                {point.refs.map((ref) => (
                  <li key={ref} className="of-ai-sheet__gist">
                    {gist(ref)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {/* What Apply does, said before it is pressed. */}
      <p className="of-ai-sheet__note" data-testid="summary-adds">
        Adds a text box citing {notesNoun(cited)}; nothing summarised changes
      </p>
      <ReviewActions name="summary" remaining={remaining} onDiscard={onDiscard} />
    </form>
  )
}
