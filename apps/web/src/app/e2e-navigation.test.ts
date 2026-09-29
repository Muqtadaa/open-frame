import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Where the browser suites are allowed to navigate.
 *
 * `/` stopped being a board when the front door arrived, and every spec that
 * wanted a board had to say which one. `e2e/routes.ts` was written to make
 * that one line instead of eighteen — and it only covered ONE of the two
 * browser suites. `e2e-rooms/` went on opening `/`, waiting sixty seconds for
 * a status bar that was never going to appear, and CI failed on two
 * consecutive pushes before anybody looked.
 *
 * `pnpm test:rooms` needs a real Durable Object and cannot run in every
 * environment, which is exactly why the rule it broke is checked HERE, in a
 * unit test that runs everywhere.
 */

const SUITES = ['e2e', 'e2e-rooms']

/** The home spec is about the front door, so it says `HOME_URL` and means it. */
const BARE_NAVIGATION = /\.goto\(\s*['"`]\/['"`]/

/**
 * A selector naming a styling class, inside a string. The stylesheet's class
 * names are the design's to change, and a test about BEHAVIOUR that reaches an
 * element through one breaks when a surface is restyled — about two hundred
 * lines did. Reach an element by its role, its label or a `data-testid`.
 */
const STRING_LITERAL = /(['"`])((?:(?!\1)[^\\\n])*)\1/g
const STYLING_CLASS = /\.(of-[\w-]+)/g

/**
 * The classes a spec may still name, because the class IS what it tests: a
 * visual state with nothing semantic to stand in for it.
 */
const STYLE_UNDER_TEST: Readonly<Record<string, string>> = {
  'of-presence__outline--editing': 'held is drawn solid rather than dashed; the look is the claim',
  'of-table-strip__item--within':
    'a header inside the selection is shaded, and nothing else says so',
  'of-p': "a paragraph is the rich-text editor's DOM contract (ADR 0014), not a styling hook",
}

function specFiles(
  suffix = '.spec.ts',
): readonly { readonly name: string; readonly source: string }[] {
  const found: { name: string; source: string }[] = []
  for (const suite of SUITES) {
    const dir = resolve(process.cwd(), suite)
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(suffix)) continue
      found.push({ name: `${suite}/${entry}`, source: readFileSync(resolve(dir, entry), 'utf8') })
    }
  }
  return found
}

describe('the browser suites', () => {
  it('has specs in both of them, so this test cannot pass by finding nothing', () => {
    const bySuite = new Map<string, number>()
    for (const spec of specFiles()) {
      const suite = spec.name.split('/')[0] ?? ''
      bySuite.set(suite, (bySuite.get(suite) ?? 0) + 1)
    }
    for (const suite of SUITES) expect(bySuite.get(suite) ?? 0).toBeGreaterThan(0)
  })

  it('never navigates to a bare slash expecting a board', () => {
    const offenders = specFiles()
      .filter((spec) => BARE_NAVIGATION.test(spec.source))
      .map((spec) => spec.name)

    // `/` is the front door. A spec that wants a board names one — `BOARD_URL`
    // — and a spec that wants the door says `HOME_URL`.
    expect(offenders).toEqual([])
  })

  it('reaches elements by role or test id, never by a styling class', () => {
    const offenders: string[] = []
    for (const file of specFiles('.ts')) {
      for (const [index, line] of file.source.split('\n').entries()) {
        // Every string on the line, then every class in it: one string can
        // name several (`'.of-rail .of-tool'`).
        for (const [, , text = ''] of line.matchAll(STRING_LITERAL)) {
          for (const [, name = ''] of text.matchAll(STYLING_CLASS)) {
            if (!(name in STYLE_UNDER_TEST)) {
              offenders.push(`${file.name}:${String(index + 1)} .${name}`)
            }
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
