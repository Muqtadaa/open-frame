import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The stylesheet as a test reads it: every part `index.css` imports, joined in
 * the order it imports them.
 *
 * For the tests only — the app gets its CSS through Vite. Several of them
 * reason about the WHOLE stylesheet (no selector argued in two places, every
 * reduced-motion block, each token pair's contrast), so reading one part, or
 * the parts in another order, would let them pass against a stylesheet the app
 * does not ship. Joined with the blank line each cut fell on, the parts are
 * exactly the single file they were split from.
 */

// Resolved from the package root, not `import.meta.url`: under jsdom that is an
// http URL, not a file one.
const DIRECTORY = resolve(process.cwd(), 'src/styles')

export interface StylePart {
  readonly file: string
  readonly css: string
}

/** The files `index.css` imports, in its order. */
export function importedParts(): readonly string[] {
  const index = readFileSync(resolve(DIRECTORY, 'index.css'), 'utf8')
  return [...index.matchAll(/^@import '\.\/([\w-]+\.css)';$/gm)].map((match) => match[1] ?? '')
}

export function styleParts(): readonly StylePart[] {
  return importedParts().map((file) => ({
    file,
    css: readFileSync(resolve(DIRECTORY, file), 'utf8'),
  }))
}

/** The whole stylesheet, as the app applies it. */
export function readStyles(): string {
  return styleParts()
    .map((part) => part.css)
    .join('\n')
}
