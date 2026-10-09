import {
  MAX_VOTES_PER_PERSON,
  VOTE_MARK,
  objectsInPaintOrder,
  type ObjectId,
  type VoteScope,
} from '@openframe/core'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { ExpandIcon } from '../controls/icons.js'
import { stepMenu } from '../controls/menu-keys.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useDismiss } from '../controls/use-dismiss.js'
import { useViewportSize } from '../controls/use-viewport-size.js'
import { wrapTab } from '../controls/wrap-tab.js'
import { useCanEdit } from '../hooks/use-can-edit.js'
import { useCommands } from '../hooks/use-commands.js'
import { useMe } from '../hooks/use-me.js'
import {
  countsShown,
  rankVotes,
  topPlaces,
  useVoteRound,
  type VotingRound,
} from '../hooks/use-voting.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { focusTheBoard } from './hand-back-focus.js'
import { useEscapeToClose } from '../controls/escape-stack.js'
import { counted } from '../controls/counted.js'

/** How many places "select the top" takes: what a session usually carries forward. */
const TOP = 3
const DEFAULT_PER_PERSON = 5
/** Below this the banner is one line, with the round's actions in a menu. */
const PHONE_WIDTH = 520

interface RoundAction {
  readonly id: string
  readonly label: string
  readonly ghost?: boolean
  readonly expanded?: boolean
  /** The control that takes the keyboard once it has run (see `handTo`). */
  readonly next?: string
  /** A mode rather than a deed: drawn as a checkable item in the menu. */
  readonly checked?: boolean
  readonly run: () => void
}

/**
 * Dot voting, along the top of the board: setting a round up, and then the
 * round itself — how many dots you have left, the switch that turns presses
 * into votes, and, for whoever runs it, revealing and ending it.
 *
 * At the top rather than in a sheet, because while a round runs it is the one
 * thing everybody at the board is doing, and they need to see it without
 * opening anything.
 */
export function VotingBanner() {
  const setup = useInteractionStore((state) => state.votingSetup)
  const closeSetup = useInteractionStore((state) => state.closeVotingSetup)
  const round = useVoteRound()
  const roundOpen = round?.data.status === 'open'
  /*
   * A round somebody else started puts away the one being set up here. Merely
   * hidden behind it, the form came back the moment their round ended, in
   * place of its results, ready to replace it (Codex, on #65).
   */
  useEffect(() => {
    if (roundOpen && setup !== null) closeSetup()
  }, [roundOpen, setup, closeSetup])
  /*
   * A vote tool with no open round to vote in is a trap: clicks do nothing and
   * nothing on screen says why. Put down HERE, wherever the round went — ended,
   * cleared, undone, or taken by a peer or a restored version — not in the
   * round's own bar, which is gone by the time it matters.
   */
  const tool = useInteractionStore((state) => state.tool)
  const setTool = useInteractionStore((state) => state.setTool)
  useEffect(() => {
    if (!roundOpen && tool === 'dot') setTool('select')
  }, [roundOpen, tool, setTool])
  if (setup !== null && !roundOpen) return <VotingSetup scope={setup} />
  if (round === null) return null
  return <VotingRoundBar round={round} />
}

function VotingSetup({ scope }: { readonly scope: VoteScope }) {
  const close = useInteractionStore((state) => state.closeVotingSetup)
  const setTool = useInteractionStore((state) => state.setTool)
  const commands = useCommands()
  const me = useMe()
  const [title, setTitle] = useState('')
  const [perPerson, setPerPerson] = useState(String(DEFAULT_PER_PERSON))
  const [hidden, setHidden] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    first.current?.focus()
  }, [])

  /*
   * Escape closes the setup from anywhere while it is open, and hands the
   * keyboard back to the board (E1). Heard only inside the form, an Escape
   * pressed after focus had moved left the setup open; and closing it dropped
   * the keyboard on the page.
   */
  const cancel = useCallback(() => {
    close()
    focusTheBoard()
  }, [close])
  useEscapeToClose(cancel)

  const votes = Number(perPerson)
  const valid = Number.isInteger(votes) && votes >= 1 && votes <= MAX_VOTES_PER_PERSON

  return (
    <form
      className="of-notice of-voting of-voting--setup"
      aria-labelledby={`${id}-heading`}
      data-testid="voting-setup"
      onKeyDown={wrapTab}
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid || me === null) return
        const started = commands.startVoting(
          { title: title.trim(), scope, perPerson: votes, hidden },
          me,
        )
        if (!started) return
        close()
        // Starting a round is asking to vote in it.
        setTool('dot')
      }}
    >
      <h2 className="of-voting__heading" id={`${id}-heading`}>
        Dot voting · {scopeText(scope)}
      </h2>
      <label className="of-voting__field">
        <span>Title</span>
        <input
          ref={first}
          className="of-input"
          value={title}
          maxLength={80}
          data-testid="voting-title"
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />
      </label>
      <label className="of-voting__field of-voting__field--narrow">
        <span>Votes each</span>
        <input
          className="of-input"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_VOTES_PER_PERSON}
          value={perPerson}
          aria-invalid={!valid}
          data-testid="voting-per-person"
          onChange={(event) => {
            setPerPerson(event.target.value)
          }}
        />
      </label>
      <label className="of-voting__check">
        <input
          type="checkbox"
          checked={hidden}
          data-testid="voting-hidden"
          onChange={(event) => {
            setHidden(event.target.checked)
          }}
        />
        <span>Hide counts until revealed</span>
      </label>
      <div className="of-voting__actions">
        <button
          type="submit"
          className="of-button of-button--primary"
          disabled={!valid || me === null}
          data-testid="voting-start"
        >
          Start
        </button>
        <button type="button" className="of-button of-button--ghost" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function scopeText(scope: VoteScope): string {
  switch (scope.kind) {
    case 'board':
      return 'whole board'
    case 'frame':
      return 'this frame'
    case 'objects':
      return `${counted(scope.ids.length, 'note')}`
  }
}

function VotingRoundBar({ round }: { readonly round: VotingRound }) {
  const canEdit = useCanEdit()
  const me = useMe()
  const commands = useCommands()
  const takingBack = useInteractionStore((state) => state.takingBack)
  const setTakingBack = useInteractionStore((state) => state.setTakingBack)
  const tool = useInteractionStore((state) => state.tool)
  const setTool = useInteractionStore((state) => state.setTool)
  const votes = useRoundVotes(round.id)
  const compact = useViewportSize().width < PHONE_WIDTH
  /*
   * Whether the results are open: what the person last chose, or — until they
   * choose — whether the round has ENDED. Ending is when a room wants the
   * answer, and it opened only for whoever pressed Results, so everybody else
   * watched the facilitator read out a list they could not see. From the
   * round's status, which every peer has, rather than from a press, which
   * only one does.
   */
  const [chosen, setChosen] = useState<boolean | null>(null)
  /*
   * Reveal and Clear cannot be taken back in the room — undo is one person's,
   * and everybody has already seen the counts — so each asks first, in the
   * bar, rather than in a dialog over the board people are looking at.
   */
  const [confirming, setConfirming] = useState<'reveal' | 'clear' | null>(null)
  const bar = useRef<HTMLElement>(null)
  /*
   * The control that takes the keyboard next. End, Reveal and Reopen each
   * leave the bar as they take effect, and focus on a removed button falls to
   * the page (E1); so a press names its successor, and the bar hands focus on
   * once it has rendered.
   */
  const handTo = useRef<string | null>(null)
  useEffect(() => {
    const next = handTo.current
    if (next === null) return
    handTo.current = null
    // On a phone the successor is in the menu, which has closed: its button.
    ;(
      bar.current?.querySelector<HTMLElement>(`[data-testid="${next}"]`) ??
      bar.current?.querySelector<HTMLElement>('[data-testid="voting-more"]')
    )?.focus()
  })
  /*
   * A banner that arrives while the keyboard is nowhere — after Start — takes
   * it, at Vote. Once who is voting is known: until then there is no Vote
   * button, and the keyboard landed on Results.
   */
  const settled = me !== null || !canEdit
  const arrived = useRef(false)
  useEffect(() => {
    if (!settled || arrived.current) return
    arrived.current = true
    if (document.activeElement !== null && document.activeElement !== document.body) return
    ;(
      bar.current?.querySelector<HTMLElement>('[data-testid="voting-vote"]') ??
      bar.current?.querySelector<HTMLElement>('button')
    )?.focus()
  }, [settled])
  const open = round.data.status === 'open'
  const shown = countsShown(round.data)
  // A change of status puts the results back to following it.
  const [seen, setSeen] = useState(round.data.status)
  if (seen !== round.data.status) {
    setSeen(round.data.status)
    setChosen(null)
    setConfirming(null)
  }
  /*
   * The results open on End for everyone — except on a phone, where the list
   * would take the top of the board the one-line banner gives back. There
   * Results is in the menu, a press away.
   */
  const showing = chosen ?? (!open && !compact)
  const mine = me === null ? 0 : votes.filter((vote) => vote.by === me.key).length
  const left = Math.max(0, round.data.perPerson - mine)
  const voting = tool === 'dot'
  /*
   * PUTTING DOWN THE LAST VOTE lets go of the tool. Left armed, the next press
   * on a note was refused with an error toast for doing the obvious thing;
   * now it selects, and the bar says the allowance is spent. On the moment it
   * runs out, not whenever it is out: arming again with none left is asked
   * for, and is answered by the refusal.
   */
  const before = useRef<number | null>(null)
  useEffect(() => {
    // Not until who is voting is known: the count jumps from "all left" to
    // the truth when it is, which is no vote being put down.
    if (me === null) return
    const was = before.current
    before.current = left
    if (!open || was === null || was === 0 || left !== 0) return
    if (useInteractionStore.getState().tool === 'dot') setTool('select')
    useInteractionStore.getState().announce(`All ${String(round.data.perPerson)} votes placed`)
  }, [left, me, open, round.data.perPerson, setTool])
  /*
   * How many PEOPLE have voted — never which notes — so whoever runs a hidden
   * round knows when the room is done without the counts leaking early.
   */
  const people = new Set(votes.map((vote) => vote.by)).size
  const turnout = people === 0 ? '' : ` · ${counted(people, 'person', 'people')} voted`

  const status = !open
    ? 'Voting ended'
    : canEdit
      ? left === 0
        ? `All ${String(round.data.perPerson)} votes placed${turnout}`
        : `${String(left)} of ${String(round.data.perPerson)} votes left${turnout}`
      : // Said, rather than a round nobody here can join and no reason why.
        `Voting open · view only${turnout}`

  /*
   * What can be done to the round besides voting in it. Beside the switch on
   * a wide window; in a menu on a phone, where the banner is one line so it
   * covers a strip of the board rather than its whole top (owner, 10-09).
   */
  const actions: readonly RoundAction[] = [
    ...(open && canEdit && round.data.hidden
      ? [
          {
            id: 'voting-reveal',
            label: 'Reveal',
            next: 'voting-confirm-yes',
            run: () => {
              setConfirming('reveal')
            },
          },
        ]
      : []),
    ...(shown
      ? [
          {
            id: 'voting-results',
            label: 'Results',
            expanded: showing,
            run: () => {
              setChosen(!showing)
            },
          },
        ]
      : []),
    ...(open && canEdit
      ? [
          {
            id: 'voting-end',
            label: 'End',
            ghost: true,
            next: 'voting-reopen',
            run: () => {
              commands.setVoting({ status: 'closed' })
            },
          },
        ]
      : []),
    ...(!open && canEdit
      ? [
          {
            id: 'voting-reopen',
            label: 'Reopen',
            next: 'voting-end',
            run: () => {
              commands.setVoting({ status: 'open' })
            },
          },
          {
            id: 'voting-clear',
            label: 'Clear',
            ghost: true,
            next: 'voting-confirm-yes',
            run: () => {
              setConfirming('clear')
            },
          },
        ]
      : []),
  ]

  // An action runs, and names the control that takes the keyboard after it.
  function perform(action: RoundAction): void {
    if (action.next !== undefined) handTo.current = action.next
    action.run()
  }

  // On a phone the line holds the count and little else.
  const shortStatus = !open
    ? 'Voting ended'
    : !canEdit
      ? 'View only'
      : left === 0
        ? `All ${String(round.data.perPerson)} placed`
        : `${String(left)} of ${String(round.data.perPerson)} left`
  const title = round.data.title === '' ? 'Dot voting' : round.data.title

  return (
    <section
      ref={bar}
      className={`of-notice of-voting${compact ? ' of-voting--compact' : ''}`}
      aria-label="Dot voting"
      data-testid="voting"
      data-status={round.data.status}
    >
      <div className="of-voting__row">
        {!compact && <span className="of-voting__title">{title}</span>}
        <span className="of-voting__status" data-testid="voting-status" role="status">
          {compact ? shortStatus : status}
        </span>
        {compact && open && canEdit && me !== null && (
          // One switch on a phone: Take back is in the menu beside it.
          <button
            type="button"
            className="of-button"
            aria-pressed={voting}
            data-testid="voting-vote"
            onClick={() => {
              if (voting) setTool('select')
              else {
                setTool('dot')
                setTakingBack(false)
              }
            }}
          >
            {voting ? (takingBack ? 'Taking back' : 'Voting') : 'Vote'}
          </button>
        )}
        {!compact && open && canEdit && me !== null && (
          /*
           * Two modes of the one tool, side by side. Taking a dot back was
           * Alt-click only, which a finger cannot do: on a phone a misplaced
           * vote could only be undone (audit 2026-10-08). Alt still takes one
           * back while adding; the mode is the way that needs no key.
           */
          <div className="of-voting__modes" role="group" aria-label="Vote tool">
            <button
              type="button"
              className="of-button"
              aria-pressed={voting && !takingBack}
              data-testid="voting-vote"
              onClick={() => {
                if (voting && !takingBack) setTool('select')
                else {
                  setTool('dot')
                  setTakingBack(false)
                }
              }}
            >
              {voting && !takingBack ? 'Voting' : 'Vote'}
            </button>
            <button
              type="button"
              className="of-button"
              aria-pressed={voting && takingBack}
              data-testid="voting-take-back"
              aria-label="Take back"
              aria-description="Alt-click also takes one back"
              data-tip="Alt-click also takes one back"
              onClick={() => {
                if (voting && takingBack) setTool('select')
                else {
                  setTool('dot')
                  setTakingBack(true)
                }
              }}
            >
              Take back
            </button>
          </div>
        )}
        {compact ? (
          <MoreActions
            heading={`${title}${turnout}`}
            onChoose={perform}
            actions={[
              ...(open && canEdit && me !== null
                ? [
                    {
                      id: 'voting-take-back',
                      label: 'Take back dots',
                      checked: voting && takingBack,
                      run: () => {
                        if (voting && takingBack) setTool('select')
                        else {
                          setTool('dot')
                          setTakingBack(true)
                        }
                      },
                    },
                  ]
                : []),
              ...actions,
            ]}
          />
        ) : (
          actions.map((action) => (
            <ActionButton key={action.id} action={action} onChoose={perform} />
          ))
        )}
      </div>
      {confirming !== null && (
        <div className="of-voting__confirm" role="group" aria-labelledby={`${round.id}-ask`}>
          <span id={`${round.id}-ask`} data-testid="voting-confirm">
            {confirming === 'reveal'
              ? 'Show everyone the counts?'
              : 'Clear every vote in this round?'}
          </span>
          <button
            type="button"
            className="of-button of-button--primary"
            data-testid="voting-confirm-yes"
            onClick={() => {
              setConfirming(null)
              if (confirming === 'reveal') {
                commands.setVoting({ hidden: false })
                handTo.current = 'voting-results'
                return
              }
              commands.clearVoting()
              // The banner goes with the round.
              focusTheBoard()
            }}
          >
            {confirming === 'reveal' ? 'Reveal' : 'Clear'}
          </button>
          <button
            type="button"
            className="of-button of-button--ghost"
            data-testid="voting-confirm-no"
            onClick={() => {
              handTo.current = confirming === 'reveal' ? 'voting-reveal' : 'voting-clear'
              setConfirming(null)
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {shown && showing && <Results votes={votes} canSelect />}
    </section>
  )
}

/** One of the round's actions, beside the switch on a wide window. */
function ActionButton({
  action,
  onChoose,
}: {
  readonly action: RoundAction
  readonly onChoose: (action: RoundAction) => void
}) {
  return (
    <button
      type="button"
      className={`of-button${action.ghost === true ? ' of-button--ghost' : ''}`}
      aria-expanded={action.expanded}
      data-testid={action.id}
      onClick={() => {
        onChoose(action)
      }}
    >
      {action.label}
    </button>
  )
}

/** The round's actions on a phone: one button, and a menu of what it holds. */
function MoreActions({
  heading,
  actions,
  onChoose,
}: {
  /** What the line leaves out: the round's title, and how many have voted. */
  readonly heading: string
  readonly actions: readonly RoundAction[]
  readonly onChoose: (action: RoundAction) => void
}) {
  const [open, setOpen] = useState(false)
  const { ref, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)
  const menu = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    ref.current?.focus()
  }, [ref])
  useDismiss(menu, ref, close, open)
  // Into the menu on arrival, at its first entry.
  useEffect(() => {
    if (!open || anchor === null) return
    menu.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
  }, [open, anchor])
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="of-icon-button of-voting__more"
        aria-label="Voting actions"
        data-tip="Voting actions"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="voting-more"
        onClick={() => {
          setOpen((was) => !was)
        }}
      >
        <ExpandIcon />
      </button>
      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="voting-more-surface"
        >
          <div
            ref={menu}
            className="of-menu of-surface"
            role="menu"
            aria-label="Voting actions"
            onKeyDown={(event) => {
              stepMenu(event, close)
            }}
          >
            <p className="of-menu__label" data-testid="voting-more-heading">
              {heading}
            </p>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                role={action.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={action.checked}
                tabIndex={-1}
                className="of-menu__item"
                data-testid={action.id}
                onClick={() => {
                  /*
                   * Closed first. An action that hands the keyboard on (End,
                   * Reveal) names where; one that does not (a mode, Results)
                   * gives it back to this button, or it fell to the page
                   * with the item it was on (Codex, on #102).
                   */
                  if (action.next === undefined) close()
                  else setOpen(false)
                  onChoose(action)
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </AnchoredSurface>
      )}
    </>
  )
}

interface CastVote {
  readonly target: ObjectId
  readonly by: string
}

/** Every dot in the round, as one string that compares by value (rule 9). */
function useRoundVotes(round: ObjectId): readonly CastVote[] {
  const { runtime } = useOpenFrame()
  const subscribe = useCallback(
    (onChange: () => void) => runtime.store.subscribeToStructure(onChange),
    [runtime.store],
  )
  const getSnapshot = useCallback(
    () =>
      runtime.registry
        .marksWithin(runtime.store.getDocument(), round)
        .filter((link) => link.edge.kind === VOTE_MARK)
        .map((link) => `${link.edge.target}\t${link.edge.by}`)
        .sort()
        .join('\n'),
    [runtime, round],
  )
  const signature = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return useMemo(
    () =>
      signature === ''
        ? []
        : signature.split('\n').map((line) => {
            const [target = '', by = ''] = line.split('\t')
            return { target: target as ObjectId, by }
          }),
    [signature],
  )
}

function Results({
  votes,
  canSelect,
}: {
  readonly votes: readonly CastVote[]
  readonly canSelect: boolean
}) {
  const { runtime } = useOpenFrame()
  const commands = useCommands()
  const setSelection = useInteractionStore((state) => state.setSelection)
  const ranked = useMemo(() => {
    const counts = new Map<ObjectId, number>()
    for (const vote of votes) counts.set(vote.target, (counts.get(vote.target) ?? 0) + 1)
    /*
     * Ties in BOARD order — the order the notes are drawn in. Not the ids',
     * which end in random characters and say nothing about the board (Codex,
     * on #65). One pass over the board, when the votes change, never per note.
     */
    const order = objectsInPaintOrder(runtime.store.getDocument())
      .filter((object) => counts.has(object.id))
      .map((object) => object.id)
    return rankVotes(counts, order)
  }, [votes, runtime.store])

  if (ranked.length === 0) {
    return <p className="of-voting__empty">No votes yet</p>
  }

  const doc = runtime.store.getDocument()
  const most = ranked[0]?.count ?? 1
  return (
    <div className="of-voting__results">
      <ol className="of-voting__list" data-testid="voting-list">
        {ranked.map((entry, index) => {
          // Tied notes share a place: 1, 2, 2, 4.
          const place =
            index > 0 && ranked[index - 1]?.count === entry.count
              ? ranked.findIndex((other) => other.count === entry.count) + 1
              : index + 1
          const share = Math.round((entry.count / most) * 100)
          const object = doc.objects.get(entry.id)
          const gist =
            object === undefined ? 'Removed' : runtime.registry.describeObject(object).gist.trim()
          return (
            <li key={entry.id} style={{ '--of-row': Math.min(index, 5) } as CSSProperties}>
              <button
                type="button"
                className="of-voting__result"
                disabled={object === undefined}
                onClick={() => {
                  commands.reveal(entry.id)
                }}
              >
                {/* An ink wash under the row: its share of the most votes. */}
                <span
                  className="of-voting__bar"
                  data-testid="voting-bar"
                  data-share={share}
                  aria-hidden="true"
                  style={{ transform: `scaleX(${String(entry.count / most)})` }}
                />
                <span className="of-voting__rank" data-testid="voting-rank">
                  {place}
                </span>
                <span className="of-voting__gist">{gist === '' ? 'Untitled' : gist}</span>
                <span className="of-voting__count">{entry.count}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {canSelect && (
        <button
          type="button"
          className="of-button"
          data-testid="voting-select-top"
          onClick={() => {
            setSelection(topPlaces(ranked, TOP).filter((id) => doc.objects.has(id)))
          }}
        >
          Select top {TOP}
        </button>
      )}
    </div>
  )
}
