import { isEmptyText, plainTextOf, type PollData } from '@openframe/core'

import { PollIcon } from '../controls/icons.js'
import { fontFamily, inkColor, readableInkOn, surfaceOf } from '../scene/style-tokens.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import { tallyPoll } from './poll-tally.js'
import {
  defineObjectView,
  type ObjectEditorProps,
  type ObjectTool,
  type ObjectViewProps,
} from './registry.js'

/**
 * A poll: the question, and its options as buttons that answer it.
 *
 * Answered ON the card, because that is where everybody is looking. The
 * options are editor chrome, so a press is an answer and never the start of a
 * drag; the card is moved by its question and its edges.
 *
 * While results are hidden, a person sees which option is theirs and nothing
 * else until the poll closes. Hidden by the interface only — the answers are
 * objects on the board.
 */
function PollRenderer({ object, marks }: ObjectViewProps<PollData>) {
  const { text, options, closed, hideResults } = object.data
  const tally = tallyPoll(marks?.on ?? [], options, marks?.me?.key ?? null)
  const shown = marks !== undefined && (!hideResults || closed)
  const most = Math.max(1, ...tally.options.map((option) => option.count))
  const answerable = marks !== undefined && marks.canAct && marks.me !== null && !closed
  const question = plainTextOf(text).trim()

  return (
    <div
      className="of-poll"
      style={{
        background: surfaceOf(object.style.color, 'white'),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color ?? 'white'),
        fontFamily: fontFamily(object.style.font),
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      aria-label={isEmptyText(text) ? 'Empty poll' : `Poll: ${question}`}
    >
      <div className="of-poll__question" data-testid="poll-question">
        <RichTextView value={text} />
      </div>
      <ul className="of-poll__options of-editor-chrome" data-testid="poll-options">
        {tally.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className="of-poll__option"
              data-testid={`poll-option-${option.id}`}
              aria-pressed={option.mine}
              disabled={!answerable}
              aria-label={
                shown
                  ? `${option.label}, ${String(option.count)} ${option.count === 1 ? 'answer' : 'answers'}`
                  : option.label
              }
              onClick={() => {
                const me = marks?.me
                if (marks === undefined || me === null || me === undefined) return
                marks.act({ kind: 'AnswerPoll', poll: object.id, option: option.id, by: me })
              }}
            >
              {shown && (
                <span
                  className="of-poll__bar"
                  aria-hidden="true"
                  style={{ width: `${String(Math.round((option.count / most) * 100))}%` }}
                />
              )}
              <span className="of-poll__label">{option.label}</span>
              {shown && (
                <span className="of-poll__count" aria-hidden="true">
                  {option.count}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="of-poll__state" data-testid="poll-state">
        {[
          closed ? 'Closed' : '',
          shown ? `${String(tally.people)} ${tally.people === 1 ? 'person' : 'people'}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  )
}

/** The question, edited in place; the options are edited in the record panel. */
function PollEditor({ object, Chrome, onCommit }: ObjectEditorProps<PollData>) {
  return (
    <RichTextEditor
      initialText={object.data.text}
      Chrome={Chrome}
      className="of-poll of-poll__editor"
      style={{
        background: surfaceOf(object.style.color, 'white'),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color ?? 'white'),
        fontFamily: fontFamily(object.style.font),
      }}
      ariaLabel="Edit poll question"
      onCommit={(next) => onCommit({ text: next })}
    />
  )
}

/** P for poll: free, and the first letter of the word on the button. */
const pollTool: ObjectTool = {
  label: 'Poll',
  keys: ['p'],
  order: 80,
  place: 'click',
  Icon: () => <PollIcon />,
  cursor: () => ({
    body: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    detail: 'M7 8h7M7 12h10M7 16h4',
  }),
}

export const pollView = defineObjectView<PollData>({
  type: 'poll',
  defaultColor: 'white',
  readsMarks: true,
  tool: pollTool,
  Renderer: PollRenderer,
  InlineEditor: PollEditor,
})
