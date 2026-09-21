import { mentionSegments } from '../hooks/use-comments.js'

/**
 * A comment body, with the people in it drawn as people.
 *
 * Printing `body` straight into the page would put `@[Jill](a3f1…)` on screen,
 * which is worse than the bare name the token replaced — so every place a
 * body is SHOWN goes through here, and every place a body is squeezed into a
 * string attribute goes through `plainMentionText`. Those two between them are
 * the whole rule: a raw token must never reach a reader.
 *
 * `whoIsMe` highlights the reader's own mentions more strongly. Being named is
 * the reason this feature exists, and finding your own name in a paragraph is
 * the thing the colour is for.
 */
export function MentionText({
  body,
  whoIsMe = null,
}: {
  readonly body: string
  readonly whoIsMe?: string | null
}) {
  return (
    <>
      {mentionSegments(body).map((segment, index) =>
        segment.kind === 'mention' ? (
          <span
            // A body has no ids of its own, and two mentions of the same
            // person in one comment are genuinely the same value twice.
            key={`${String(index)}-${segment.userId}`}
            className={
              segment.userId === whoIsMe ? 'of-mention is-me' : 'of-mention'
            }
            data-testid="mention-chip"
          >
            @{segment.displayName}
          </span>
        ) : (
          <span key={`${String(index)}-text`}>{segment.text}</span>
        ),
      )}
    </>
  )
}
