import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
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

/**
 * Every styling class named inside a string or template in `source`, with the
 * line it is on.
 *
 * Read off TypeScript's own parse rather than matched line by line: a
 * template that spans lines has no line holding both of its backticks, so a
 * per-line match let `` page.locator(`\n  .of-x`) `` through (Codex, on #30).
 * The parse also leaves comments out, where a class named in prose is fine.
 */
function stylingClassesIn(source: string): { line: number; name: string }[] {
  const file = ts.createSourceFile('spec.ts', source, ts.ScriptTarget.Latest, true)
  const found: { line: number; name: string }[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const start = node.getStart(file)
      // One string can name several classes (`'.of-rail .of-tool'`), each on
      // its own line when the string spans several.
      for (const match of node.getText(file).matchAll(STYLING_CLASS)) {
        const at = file.getLineAndCharacterOfPosition(start + match.index)
        found.push({ line: at.line + 1, name: match[1] ?? '' })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
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

/**
 * A navigation a spec makes by itself, rather than through `goto` or `reload`
 * in `e2e/fixtures.ts`, which wait until the page takes input. The nightly's
 * WebKit and Firefox jobs failed four nights running on specs that navigated,
 * then focused a control while `#root` was still inert.
 */
const OWN_NAVIGATION = /\b\w+\.(goto|reload)\(/g

/** Specs whose subject is the page BEFORE it takes input: they navigate by hand. */
const BEFORE_INPUT: Readonly<Record<string, string>> = {
  'e2e/brand.spec.ts': 'the splash itself, held and leaving',
  'e2e/splash.spec.ts': 'the splash itself, and what is shown while it stalls',
  'e2e/start-failed.spec.ts': 'start-up that fails, where the page may never take input',
  'e2e/keys-at-load.spec.ts': 'keys pressed while the page is still loading',
  'e2e/fixtures.ts': 'where goto and reload are defined',
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

  it('navigates through goto and reload, which wait until the page takes input', () => {
    const offenders: string[] = []
    for (const file of specFiles('.ts')) {
      if (!file.name.startsWith('e2e/') || file.name in BEFORE_INPUT) continue
      file.source.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(OWN_NAVIGATION)) {
          offenders.push(`${file.name}:${String(index + 1)} ${match[0]}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('reaches elements by role or test id, never by a styling class', () => {
    const offenders: string[] = []
    for (const file of specFiles('.ts')) {
      for (const { line, name } of stylingClassesIn(file.source)) {
        if (!(name in STYLE_UNDER_TEST)) offenders.push(`${file.name}:${String(line)} .${name}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('finding a styling class in a spec', () => {
  it('finds every class in a string, and says where', () => {
    const source = "const a = 1\npage.locator('.of-rail .of-tool')\n"
    expect(stylingClassesIn(source)).toEqual([
      { line: 2, name: 'of-rail' },
      { line: 2, name: 'of-tool' },
    ])
  })

  it('finds a class in a template that runs over several lines', () => {
    const source = 'page.locator(`\n  [data-object-type="sticky"]\n  .of-sticky__text\n`)\n'
    expect(stylingClassesIn(source)).toEqual([{ line: 3, name: 'of-sticky__text' }])
  })

  it('is not fooled by prose: a class in a comment, an apostrophe', () => {
    const source = [
      "// don't reach for .of-sticky here",
      "/* nor .of-frame, whatever it's called */",
      "page.getByTestId('frame-title')",
    ].join('\n')
    expect(stylingClassesIn(source)).toEqual([])
  })
})
