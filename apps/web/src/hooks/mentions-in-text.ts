import type { BoardPerson } from '../app/discussion.js'

/**
 * Who a comment is speaking to, and how that survives a rename.
 *
 * Pure text, no React, so the rules here are testable without a component —
 * and they need to be, because every one of them exists to stop a
 * notification going to the wrong person or to nobody at all.
 *
 * There are TWO ways a person can be named, and both are honoured:
 *
 * - A TOKEN, `@[Name](id)`, written by the picker. The id is what counts, so
 *   renaming somebody does not break the mentions already written at them and
 *   two people sharing a display name cannot be confused for one another.
 * - PLAIN TEXT, `@Name`, matched against the people on the board. Kept
 *   because it is what four thousand existing comments contain, and because
 *   somebody typing a name and dismissing the menu still means it. Dropping
 *   this would make a hand-typed mention silently go nowhere, which is the
 *   one failure a notification feature cannot have.
 */

/**
 * A written mention.
 *
 * The NAME travels with the id rather than being looked up. A comment is
 * plain text in a database row and is read in places that have no board
 * loaded — the notification list is one — so a token that needed a directory
 * to be legible would render as an id there. It also means a mention still
 * reads correctly after its subject leaves the board.
 */
const TOKEN = /@\[([^\][\n]+)\]\(([0-9A-Za-z_-]{1,64})\)/g

/** Anything that would end the name early, or open a second token inside one. */
function nameForToken(displayName: string): string {
  const safe = displayName.replace(/[[\]\n]/g, ' ').replace(/\s+/g, ' ').trim()
  return safe === '' ? 'Someone' : safe
}

/** What the picker inserts. */
export function mentionToken(person: BoardPerson): string {
  return `@[${nameForToken(person.displayName)}](${person.userId})`
}

export interface MentionSegment {
  readonly kind: 'mention'
  readonly userId: string
  readonly displayName: string
}

export interface TextSegment {
  readonly kind: 'text'
  readonly text: string
}

export type BodySegment = MentionSegment | TextSegment

/**
 * A comment body split into what to draw.
 *
 * A renderer walks this instead of printing `body`, because a raw
 * `@[Jill](uuid)` on screen is worse than the bare name it replaced.
 */
export function mentionSegments(text: string): readonly BodySegment[] {
  const segments: BodySegment[] = []
  let at = 0
  for (const match of text.matchAll(TOKEN)) {
    const [whole, displayName, userId] = match
    if (displayName === undefined || userId === undefined) continue
    if (match.index > at) segments.push({ kind: 'text', text: text.slice(at, match.index) })
    segments.push({ kind: 'mention', userId, displayName })
    at = match.index + whole.length
  }
  if (at < text.length) segments.push({ kind: 'text', text: text.slice(at) })
  return segments
}

/**
 * The body as a person would read it, for somewhere that cannot draw a chip.
 *
 * A tooltip, a one-line preview, a `title` attribute. Those take a string and
 * nothing else, and the alternative to this is a token in the middle of them.
 */
export function plainMentionText(text: string): string {
  return text.replace(TOKEN, (_whole, displayName: string) => `@${displayName}`)
}

/** The text with every token removed, so a name inside one cannot match twice. */
function withoutTokens(text: string): string {
  return text.replace(TOKEN, ' ')
}

/** A name goes into a pattern verbatim; people are allowed punctuation. */
function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The people on the board that a piece of text names.
 *
 * Tokens first, then names matched against the people actually here rather
 * than parsed as free text: a mention is a notification, and a notification to
 * a name nobody has is a message that silently goes nowhere.
 *
 * A token whose id is NOT on the board is dropped rather than trusted. The
 * database refuses such a row anyway — the insert policy checks board
 * membership — and one rejected mention fails the whole comment with it, so a
 * body pasted from another board must not be able to take the comment down.
 *
 * The name match ENDS ON A BOUNDARY, which is the whole of the correctness in
 * that half. A plain substring search finds "@Sam" inside "@Samira", so
 * writing to Samira also notified Sam — somebody who was not being spoken to,
 * on a board where one name happens to begin another. Sorting the list by
 * length did not fix that and never could: it changes the order of the
 * results, not which names are found.
 *
 * Longest first AND consumed, for the other half of the same problem: with
 * both "Sam" and "Sam Smith" on a board, "@Sam Smith" ends on a boundary for
 * both of them. Taking the longer one out of the text first means the shorter
 * cannot also claim it.
 */
export function mentionsIn(text: string, people: readonly BoardPerson[]): string[] {
  const here = new Set(people.map((person) => person.userId))
  const found: string[] = []

  for (const segment of mentionSegments(text)) {
    if (segment.kind !== 'mention') continue
    if (!here.has(segment.userId)) continue
    if (!found.includes(segment.userId)) found.push(segment.userId)
  }

  let remaining = withoutTokens(text)
  const byLongest = [...people].sort((a, b) => b.displayName.length - a.displayName.length)
  for (const person of byLongest) {
    const pattern = new RegExp(
      `@${escapeForPattern(person.displayName)}(?![\\p{L}\\p{N}'-])`,
      'iu',
    )
    if (!pattern.test(remaining)) continue
    if (!found.includes(person.userId)) found.push(person.userId)
    remaining = remaining.replace(pattern, ' ')
  }
  return found
}

/**
 * A name that was typed at somebody who is not here, or `null`.
 *
 * Only a name that is not even the BEGINNING of somebody's — otherwise typing
 * "@Samira" one letter at a time reports "Sam" as a stranger on the way
 * through, and a warning that flashes while you type is noise you learn to
 * ignore. That forgiveness is the whole design: this exists to offer help, not
 * to mark an error.
 *
 * The first such name only. A composer is not a form to be validated; it is a
 * place to say something, and one offer to fix the problem is enough.
 */
export function unknownMentionIn(text: string, people: readonly BoardPerson[]): string | null {
  const names = people.map((person) => person.displayName.toLowerCase())
  // A token is a settled mention, not a name still being typed at somebody.
  for (const match of withoutTokens(text).matchAll(/@([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)) {
    const typed = match[1]
    if (typed === undefined) continue
    const lower = typed.toLowerCase()
    // A prefix of somebody's name is somebody still being typed.
    if (names.some((name) => name.startsWith(lower))) continue
    return typed
  }
  return null
}

export interface MentionQuery {
  /** Where the `@` is, so the insert knows what to replace. */
  readonly start: number
  /** What has been typed after it, which may be empty. */
  readonly query: string
}

/**
 * How long a name is allowed to be before the menu gives up.
 *
 * A query may contain spaces, because "Sam Smith" is a name and a picker that
 * closed on the space would never offer one. The cost is that an unmatched
 * "@" otherwise keeps the menu armed for the rest of the paragraph, so the
 * run is bounded — past this, what is being typed is prose, not a name.
 */
const LONGEST_NAME = 40

/**
 * The mention the caret is currently inside, if it is inside one.
 *
 * The `@` must open a word — start of text, or whitespace before it. Without
 * that, `me@example.com` opens a menu of people while somebody types an email
 * address, which is both wrong and in the way.
 */
export function activeMentionQuery(text: string, caret: number): MentionQuery | null {
  const upTo = text.slice(0, caret)
  const at = upTo.lastIndexOf('@')
  if (at === -1) return null

  const before = at === 0 ? '' : upTo[at - 1]
  if (before !== '' && before !== undefined && !/\s/u.test(before)) return null

  const query = upTo.slice(at + 1)
  if (query.length > LONGEST_NAME) return null
  // A bracket means this `@` is already a token, not a name being typed.
  if (!/^[\p{L}\p{N} '-]*$/u.test(query)) return null

  return { start: at, query }
}

/** The people a half-typed name is offering, best match first. */
export function peopleMatching(
  query: string,
  people: readonly BoardPerson[],
): readonly BoardPerson[] {
  const wanted = query.trim().toLowerCase()
  if (wanted === '') return people
  const matches = people.filter((person) =>
    person.displayName.toLowerCase().includes(wanted),
  )
  // Somebody whose name STARTS with what was typed is who was meant; a middle
  // match is a courtesy for a surname or a second word.
  return [...matches].sort((a, b) => {
    const aStarts = a.displayName.toLowerCase().startsWith(wanted)
    const bStarts = b.displayName.toLowerCase().startsWith(wanted)
    if (aStarts !== bStarts) return aStarts ? -1 : 1
    return a.displayName.length - b.displayName.length
  })
}

export interface Insertion {
  readonly text: string
  readonly caret: number
}

/**
 * Replaces the half-typed name at `caret` with a token for `person`.
 *
 * A trailing space goes in because the next thing typed is a word, and
 * landing it against the token's closing bracket would look like part of it —
 * but only when there is not one there already. Picking a name from the
 * middle of a written sentence otherwise leaves a double space behind, which
 * is the common case rather than the odd one: the menu is most useful when
 * you are adding somebody to a remark you have already written.
 */
export function insertMention(
  text: string,
  caret: number,
  person: BoardPerson,
): Insertion {
  const active = activeMentionQuery(text, caret)
  if (active === null) return { text, caret }
  const rest = text.slice(caret)
  const token = mentionToken(person) + (/^\s/u.test(rest) ? '' : ' ')
  return { text: text.slice(0, active.start) + token + rest, caret: active.start + token.length }
}
