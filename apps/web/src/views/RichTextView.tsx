import type { Mark, RichText, TextSpan } from '@openframe/core'

/**
 * Formatted text, rendered.
 *
 * Semantic elements rather than styled spans: `<strong>` and `<em>` mean
 * something to a screen reader and `<span class="bold">` does not, and this is
 * a document someone else will read.
 *
 * The same markup the editor produces and parses back, so what is on screen
 * while editing and what is on screen afterwards are the same thing.
 */
export function RichTextView({ value }: { value: RichText }) {
  return (
    <>
      {value.map((span, index) => (
        // The index is the key because a span has no identity of its own — it
        // is a run of characters, and runs merge and split as marks change.
        <Span key={index} span={span} />
      ))}
    </>
  )
}

const WRAPPERS: Readonly<Record<Mark, 'strong' | 'em' | 'u' | 's'>> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
}

function Span({ span }: { span: TextSpan }) {
  /*
   * Newlines are rendered as text, not as `<br>`: the container sets
   * `white-space: pre-wrap`, so a newline character is a line break and the
   * text round-trips through the model unchanged. The editor is the only place
   * `<br>` appears, because that is what a contenteditable inserts for Enter.
   */
  let node: React.ReactNode = span.text

  // Applied in a fixed order so the same formatting always yields the same
  // markup — otherwise two identical spans could produce different DOM and the
  // editor would see a change where there was none.
  for (const mark of ['strike', 'underline', 'italic', 'bold'] as const) {
    if (span.marks?.includes(mark) !== true) continue
    const Wrapper = WRAPPERS[mark]
    node = <Wrapper>{node}</Wrapper>
  }

  return span.size === undefined ? (
    <>{node}</>
  ) : (
    <span className={`of-size of-size--${span.size}`} data-size={span.size}>
      {node}
    </span>
  )
}
