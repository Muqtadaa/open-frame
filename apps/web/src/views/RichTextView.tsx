import {
  paragraphsOf,
  type Mark,
  type Paragraph,
  type RichText,
  type TextSpan,
} from '@openframe/core'

/**
 * Formatted text, rendered.
 *
 * Semantic elements rather than styled spans: `<strong>` and `<em>` mean
 * something to a screen reader and `<span class="bold">` does not, and this is
 * a document someone else will read.
 *
 * The same blocks the editor draws and reads back (ADR 0014) — one `div.of-p`
 * per paragraph, a list item marked in data attributes — so what is on screen
 * while editing and afterwards is the same thing, down to where a number
 * falls. Only here, where nobody is typing, are the runs of list items grouped
 * into a `role="list"`, so a screen reader hears a list rather than a bullet
 * drawn in CSS.
 */
export function RichTextView({ value }: { value: RichText }) {
  const runs: { list: boolean; paragraphs: Paragraph[] }[] = []
  for (const paragraph of paragraphsOf(value)) {
    const listed = paragraph.list !== undefined
    const last = runs[runs.length - 1]
    if (last?.list === listed) last.paragraphs.push(paragraph)
    else runs.push({ list: listed, paragraphs: [paragraph] })
  }
  return (
    <>
      {runs.map((run, index) =>
        // The index is the key because a paragraph has no identity of its own.
        run.list ? (
          <div key={index} className="of-list-run" role="list">
            {run.paragraphs.map((paragraph, at) => (
              <Block key={at} paragraph={paragraph} role="listitem" />
            ))}
          </div>
        ) : (
          run.paragraphs.map((paragraph, at) => (
            <Block key={`${String(index)}.${String(at)}`} paragraph={paragraph} />
          ))
        ),
      )}
    </>
  )
}

function Block({ paragraph, role }: { paragraph: Paragraph; role?: 'listitem' }) {
  return (
    <div className="of-p" role={role} data-list={paragraph.list} data-indent={paragraph.indent}>
      {paragraph.spans.length === 0 ? (
        // An empty line keeps its height, as the editor's `<br>` gives it.
        <br />
      ) : (
        paragraph.spans.map((span, index) => <Span key={index} span={span} />)
      )}
    </div>
  )
}

const WRAPPERS: Readonly<Record<Mark, 'strong' | 'em' | 'u' | 's'>> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
}

function Span({ span }: { span: TextSpan }) {
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
