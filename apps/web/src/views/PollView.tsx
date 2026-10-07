import { isEmptyText, plainTextOf, type PollData } from '@openframe/core'

import { PollIcon, CheckIcon } from '../controls/icons.js'
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
  const { text, options, closed, hideResults, by } = object.data
  const tally = tallyPoll(marks?.on ?? [], options, marks?.me?.key ?? null)
  const shown = marks !== undefined && (!hideResults || closed)
  // Bars are shares of the people who answered, so they read as proportions
  // rather than as a race to the leader.
  const of = Math.max(1, tally.people)
  const answerable = marks !== undefined && marks.canAct && marks.me !== null && !closed
  // Not on a locked poll: the command would only refuse it (Codex, on #88).
  // And only the asker's: closed under the person running the session by
  // whoever reached the card first. A poll that knows nobody is anyone's.
  const canClose =
    marks?.canAct === true && !object.locked && (by === null || by.key === marks.me?.key)
  const question = plainTextOf(text).trim()

  return (
    <div
      className="of-poll"
      data-closed={closed}
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
      {/*
        The BUTTONS are chrome, not the list: a press between two options,
        or beside one, is a press on the card — so it selects and moves it like
        any other object instead of doing nothing at all.
      */}
      <ul className="of-poll__options" data-testid="poll-options">
        {tally.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className="of-poll__option of-editor-chrome"
              data-testid={`poll-option-${option.id}`}
              aria-pressed={option.mine}
              disabled={!answerable}
              aria-label={
                shown
                  ? `${option.label}, ${String(option.count)} ${option.count === 1 ? 'answer' : 'answers'}, ${String(Math.round((option.count / of) * 100))}%`
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
                  style={{ width: `${String(Math.round((option.count / of) * 100))}%` }}
                />
              )}
              {/*
                Yours, as a mark and not only a ring: a ring is a colour, and on
                a card in somebody's own colour it was the only thing saying so.
              */}
              {option.mine && (
                <span className="of-poll__mine" data-testid="poll-mine" aria-hidden="true">
                  <CheckIcon />
                </span>
              )}
              <span className="of-poll__label">{option.label}</span>
              {shown && (
                <span className="of-poll__count" aria-hidden="true">
                  {option.count}
                  <span className="of-poll__share">{Math.round((option.count / of) * 100)}%</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <div className="of-poll__foot">
        {/*
          How many have answered is always said, hidden results or not: it
          gives away nothing about the answers, and it is how whoever asked
          knows when the room is done.
        */}
        <p className="of-poll__state" data-testid="poll-state">
          {[
            closed ? 'Closed' : '',
            marks === undefined
              ? ''
              : `${String(tally.people)} ${tally.people === 1 ? 'answer' : 'answers'}`,
            !shown && marks !== undefined ? 'results when closed' : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {canClose && (
          <button
            type="button"
            className="of-poll__close of-editor-chrome"
            data-testid="poll-close"
            onClick={() => {
              marks?.act({ kind: 'UpdateObjectData', id: object.id, patch: { closed: !closed } })
            }}
          >
            {closed ? 'Reopen' : 'Close poll'}
          </button>
        )}
      </div>
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
  // Kept on the poll, because closing it is the asker's.
  data: (_options, maker) => ({ by: maker.me }),
  needsMaker: true,
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
