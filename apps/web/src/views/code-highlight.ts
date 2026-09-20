/**
 * Syntax highlighting, fetched only when a board actually has code on it.
 *
 * The import below is DYNAMIC, which makes it a Vite split point: a board with
 * no code block never downloads the highlighter. That is the same reasoning
 * rule 12 applies to the benchmark payload — something that belongs in some
 * builds and not others must not be in the one everybody gets.
 *
 * The languages are registered one at a time rather than importing the full
 * bundle, which carries nearly two hundred of them.
 */

/*
 * The engine's type, imported as a TYPE ONLY. `import type` is erased at
 * compile time, so naming the type here does not pull the highlighter into
 * the main bundle — which is the entire point of loading it dynamically
 * below. An inline `typeof import(...)` annotation says the same thing, and
 * the lint rule forbids it precisely because the distinction is invisible.
 */
import type HighlightEngine from 'highlight.js/lib/core'

/** What the picker offers, mapped to the module that teaches it. */
const LANGUAGES: Readonly<Record<string, () => Promise<{ default: unknown }>>> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  css: () => import('highlight.js/lib/languages/css'),
  html: () => import('highlight.js/lib/languages/xml'),
  json: () => import('highlight.js/lib/languages/json'),
  python: () => import('highlight.js/lib/languages/python'),
  sql: () => import('highlight.js/lib/languages/sql'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
}

/**
 * The loaded highlighter, kept across calls.
 *
 * A promise rather than the value, so two code blocks rendering in the same
 * frame share one download instead of racing to start two.
 */
let engine: Promise<typeof HighlightEngine> | null = null
const registered = new Set<string>()

async function ready(language: string): Promise<typeof HighlightEngine> {
  engine ??= import('highlight.js/lib/core').then((module) => module.default)
  const hljs = await engine

  const load = LANGUAGES[language]
  if (load !== undefined && !registered.has(language)) {
    const module = await load()
    // Registered under the name the document uses, which is what `highlight`
    // is then asked for — `html` is xml's grammar under another name.
    hljs.registerLanguage(language, module.default as never)
    registered.add(language)
  }

  return hljs
}

/**
 * Highlighted HTML for a block of code, or `null` when it should be shown as
 * plain text.
 *
 * Null for an unknown language, for `plain`, and for any failure. The caller
 * renders the raw string in that case, which React escapes — so the ONLY path
 * that reaches `dangerouslySetInnerHTML` is one where highlight.js produced
 * the markup and escaped the input itself.
 */
export async function highlight(code: string, language: string): Promise<string | null> {
  if (!(language in LANGUAGES)) return null

  try {
    const hljs = await ready(language)
    if (!hljs.getLanguage(language)) return null
    // `ignoreIllegals` because a board holds FRAGMENTS — half a function, a
    // snippet from the middle of a file — and a grammar that refuses them
    // would leave the most common case unhighlighted.
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    // A highlighter that could not load costs colour, never the code.
    return null
  }
}
