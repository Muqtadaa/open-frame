import { CODE_LANGUAGES } from './schema.js'

/**
 * Tidying code without a parser.
 *
 * The FLOOR, not the ceiling. A real formatter understands the language and
 * can rewrap lines, normalise quotes and fix spacing inside an expression;
 * this only decides how far each line is indented. It exists because a real
 * formatter has a parser for eight of the twenty-nine languages offered here,
 * and "nothing happens" is a worse answer than "it is at least lined up".
 *
 * Pure, and in core, so the rules are testable without a browser and the same
 * answer is available to the API and to MCP later.
 */

/** Two spaces, which is what the board's own code font is measured for. */
const INDENT = '  '

/**
 * What kind of tidying a language can take.
 *
 * `none` is a real answer and the honest one for several: Python's indentation
 * IS its syntax, so re-indenting it changes what the program means. Markdown,
 * a diff and YAML are the same — leading space is content. Refusing to touch
 * them is the feature.
 */
export type TidyKind = 'json' | 'markup' | 'braces' | 'none'

const KIND: Readonly<Record<string, TidyKind>> = {
  json: 'json',
  html: 'markup',
  xml: 'markup',
  c: 'braces',
  cpp: 'braces',
  csharp: 'braces',
  css: 'braces',
  go: 'braces',
  graphql: 'braces',
  java: 'braces',
  javascript: 'braces',
  kotlin: 'braces',
  php: 'braces',
  rust: 'braces',
  scala: 'braces',
  swift: 'braces',
  typescript: 'braces',
}

export function tidyKindOf(language: string): TidyKind {
  return KIND[language] ?? 'none'
}

/** Whether anything at all will happen, for a control that must not lie. */
export function canTidy(language: string): boolean {
  return tidyKindOf(language) !== 'none'
}

/**
 * The code, tidied, or `null` when nothing can be done to it.
 *
 * `null` rather than the input unchanged, so a caller can tell "already tidy"
 * from "not something this understands" and say so.
 */
export function tidyCode(code: string, language: string): string | null {
  switch (tidyKindOf(language)) {
    case 'json':
      /*
       * A fragment falls through to plain bracket indenting rather than
       * failing. Code on a whiteboard is very often half of something — a
       * response body pasted out of the middle of a log — and refusing every
       * fragment makes the control do nothing exactly where it is most
       * wanted. Exact when it can be, tidy when it cannot.
       */
      return tidyJson(code) ?? indentByDepth(code, bracketDepth)
    case 'markup':
      return indentByDepth(code, markupDepth)
    case 'braces':
      return indentByDepth(code, bracketDepth)
    case 'none':
      return null
  }
}

/**
 * JSON is the one language here that can be formatted EXACTLY, because the
 * platform ships a parser for it. `null` means this is not JSON, which the
 * caller answers by indenting it as brackets instead.
 */
function tidyJson(code: string): string | null {
  try {
    return JSON.stringify(JSON.parse(code), null, 2)
  } catch {
    return null
  }
}

/**
 * How much a line closes before it opens, and how much it opens after.
 *
 * Returned as a pair because they are applied at different moments: a line
 * beginning with `}` is drawn at the OUTER level and everything after it is
 * too, while a line ending in `{` is drawn where it is and its successors are
 * pushed in.
 */
type Depth = (line: string) => { readonly before: number; readonly after: number }

const bracketDepth: Depth = (line) => {
  const bare = stripStringsAndComments(line)
  let before = 0
  let after = 0
  for (const character of bare) {
    if (character === '{' || character === '[' || character === '(') after += 1
    else if (character === '}' || character === ']' || character === ')') {
      // A closer with nothing open on this line belongs to a previous one, so
      // it pulls the line itself out rather than only what follows.
      if (after > 0) after -= 1
      else before += 1
    }
  }
  return { before, after }
}

const markupDepth: Depth = (line) => {
  const withoutComments = line.replace(/<!--[\s\S]*?-->/g, '')
  let before = 0
  let after = 0
  for (const [tag] of withoutComments.matchAll(/<\/?[A-Za-z][^>]*?\/?>/g)) {
    if (tag.startsWith('</')) {
      if (after > 0) after -= 1
      else before += 1
    } else if (!tag.endsWith('/>') && !tag.startsWith('<!') && !tag.startsWith('<?')) {
      // Void elements have no closing tag, so counting them would indent the
      // whole rest of the document one level deeper for ever.
      if (!VOID.test(tag)) after += 1
    }
  }
  return { before, after }
}

const VOID = /^<(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b/i

/**
 * Strings and comments hold braces that are not structure.
 *
 * `const a = "}"` closes nothing, and without this it pulls the rest of the
 * file out one level. Crude on purpose: this is an indenter, and the exact
 * language is what the real formatter is for.
 */
function stripStringsAndComments(line: string): string {
  return line
    .replace(/\\./g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/\/\/.*$/, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#.*$/, '')
}

function indentByDepth(code: string, depthOf: Depth): string {
  let level = 0
  const lines = code.split('\n').map((line) => {
    const text = line.trim()
    // A blank line keeps no indentation: trailing spaces on an empty line are
    // the most common thing a formatter is reached for to remove.
    if (text === '') return ''

    const { before, after } = depthOf(text)
    level = Math.max(0, level - before)
    const drawn = INDENT.repeat(level) + text
    level = Math.max(0, level + after)
    return drawn
  })
  return lines.join('\n')
}

/** Every language, and what each can take. Used by the contract test. */
export const TIDY_BY_LANGUAGE: Readonly<Record<string, TidyKind>> = Object.fromEntries(
  CODE_LANGUAGES.map((language) => [language, tidyKindOf(language)]),
)
