import type { Plugin } from 'prettier'

import { canTidy, tidyCode } from '@openframe/core'

/**
 * Pretty-printing the contents of a code block.
 *
 * TWO formatters, and which one runs is decided by the language:
 *
 * - A real one — Prettier — for the languages it has a parser for. It
 *   understands the code, so it rewraps lines, normalises quotes and fixes
 *   spacing inside an expression. There are eight of those.
 * - The indenter in core for everything else, which only decides how far each
 *   line is indented and says so honestly.
 *
 * The floor matters more than the ceiling here: twenty-nine languages are
 * offered and a button that does nothing for twenty-one of them is a button
 * nobody trusts for the other eight.
 *
 * Loaded DYNAMICALLY, the same as the highlighter and for the same reason —
 * Prettier and its parsers are several hundred kilobytes, and a board with no
 * code on it must never pay for them. Nothing is fetched until somebody asks
 * for a block to be formatted.
 */

/** A parser, and the plugins that parser needs to be loaded with. */
interface Recipe {
  readonly parser: string
  readonly plugins: readonly (() => Promise<{ readonly default: unknown }>)[]
}

/*
 * `estree` appears alongside `babel` and `typescript` because those two only
 * PARSE — estree is the printer that turns the result back into text. Without
 * it Prettier throws about a missing printer, which the fallback below would
 * then quietly swallow, and formatting JavaScript would silently degrade to
 * re-indenting it.
 */
const PRETTIER: Readonly<Record<string, Recipe>> = {
  css: { parser: 'css', plugins: [() => import('prettier/plugins/postcss')] },
  graphql: { parser: 'graphql', plugins: [() => import('prettier/plugins/graphql')] },
  html: { parser: 'html', plugins: [() => import('prettier/plugins/html')] },
  javascript: {
    parser: 'babel',
    plugins: [() => import('prettier/plugins/babel'), () => import('prettier/plugins/estree')],
  },
  json: {
    parser: 'json',
    plugins: [() => import('prettier/plugins/babel'), () => import('prettier/plugins/estree')],
  },
  markdown: { parser: 'markdown', plugins: [() => import('prettier/plugins/markdown')] },
  typescript: {
    parser: 'typescript',
    plugins: [
      () => import('prettier/plugins/typescript'),
      () => import('prettier/plugins/estree'),
    ],
  },
  yaml: { parser: 'yaml', plugins: [() => import('prettier/plugins/yaml')] },
}

/**
 * Whether anything at all will happen to this language.
 *
 * Asked before the control is drawn, because a button that is offered and
 * does nothing is worse than one that is plainly unavailable: the first time
 * it appears to fail you stop believing it for the languages where it works.
 */
export function canFormat(language: string): boolean {
  return language in PRETTIER || canTidy(language)
}

/**
 * The code, formatted, or `null` when nothing could be done to it.
 *
 * A syntax error falls back to the indenter rather than failing. Code on a
 * whiteboard is very often a fragment — half a function, a snippet pasted out
 * of the middle of a file — and refusing to touch anything that will not parse
 * would make the button useless exactly where it is most wanted. Lining up a
 * fragment is still worth doing.
 */
export async function formatCode(code: string, language: string): Promise<string | null> {
  const recipe = PRETTIER[language]
  if (recipe !== undefined) {
    try {
      const [{ format }, ...modules] = await Promise.all([
        import('prettier/standalone'),
        ...recipe.plugins.map((load) => load()),
      ])
      const printed = await format(code, {
        parser: recipe.parser,
        plugins: modules.map((module) => module.default as Plugin),
      })
      // Prettier ends a file with a newline, which is right for a file and
      // wrong for a box: it shows as a blank last line that the reader cannot
      // account for and cannot remove, because pressing the button puts it
      // straight back.
      return printed.replace(/\n$/, '')
    } catch {
      // Unparseable, or a plugin that would not load. Either way the indenter
      // below is still an improvement, and an error the user cannot act on is
      // not.
    }
  }

  return tidyCode(code, language)
}
