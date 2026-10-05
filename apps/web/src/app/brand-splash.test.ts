import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readStyles } from '../styles/read-styles.js'

/**
 * The splash is the one place a colour is allowed to be written twice.
 *
 * It has to paint at first paint, before any stylesheet has loaded, so its
 * critical CSS lives inline in `index.html` as literal values — outside the
 * reach of `design-tokens.test.ts`, which only reads the stylesheet. That is a
 * second source of truth for the brand, and a second source of truth drifts.
 *
 * So it is pinned here instead: every colour in the document's inline style has
 * to BE one of the tokens, and the assets it names have to exist. Changing a
 * brand token now either changes the splash or fails the build.
 */
const HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const CSS = readStyles()

function token(name: string): string {
  const match = new RegExp(`--of-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS)
  if (match?.[1] === undefined) throw new Error(`token --of-${name} is not defined`)
  return match[1].toLowerCase()
}

/** After Hours overrides `ink`, so the plain first-match reader would give the default world's. */
function afterHoursToken(name: string): string {
  const block = /:root\s*\[data-theme='after-hours'\]\s*\{([^}]*)\}/.exec(CSS)?.[1]
  if (block === undefined) throw new Error('no after-hours block')
  const match = new RegExp(`--of-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)
  if (match?.[1] === undefined) throw new Error(`after-hours --of-${name} is not defined`)
  return match[1].toLowerCase()
}

const inlineStyle = /<style>([\s\S]*?)<\/style>/.exec(HTML)?.[1] ?? ''

describe('the boot splash', () => {
  it('has inline critical CSS, or it cannot paint before the stylesheet', () => {
    expect(inlineStyle).not.toBe('')
    expect(inlineStyle).toContain('#of-splash')
  })

  /*
   * Brand colours, plus each world's page colour for the quiet sheet a tab
   * gets once it has seen the artwork — a handover from the page to the page.
   */
  it('paints only in brand colours and the worlds’ page colours', () => {
    const allowed = new Set([
      token('brand-void'),
      afterHoursToken('ink'),
      token('page'),
      afterHoursToken('page'),
    ])
    const used = (inlineStyle.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((hex) => hex.toLowerCase())

    expect(used.length).toBeGreaterThan(0)
    for (const hex of used) expect(allowed).toContain(hex)
  })

  it('draws the quiet sheet in each world’s own page colour', () => {
    const notebook =
      /\[data-splash='quiet'\] #of-splash \{[^}]*background-color: (#[0-9a-fA-F]{6})/.exec(
        inlineStyle,
      )?.[1]
    const afterHours =
      /\[data-splash-world='after-hours'\] #of-splash \{[^}]*background-color: (#[0-9a-fA-F]{6})/.exec(
        inlineStyle,
      )?.[1]
    expect(notebook?.toLowerCase()).toBe(token('page'))
    expect(afterHours?.toLowerCase()).toBe(afterHoursToken('page'))
  })

  it('tells the browser chrome the quiet sheet’s colours, and only those', () => {
    const script = /<script>\s*try \{[\s\S]*?<\/script>/.exec(HTML)?.[0] ?? ''
    const used = (script.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((hex) => hex.toLowerCase())
    expect(new Set(used)).toEqual(new Set([token('page'), afterHoursToken('page')]))
  })

  /*
   * A bed with the product's control radius, not a 999px capsule: in this
   * product round means grab me, and the label does nothing when pressed.
   */
  it('beds the label with the control radius', () => {
    const label = /#of-splash p \{([^}]*)\}/.exec(inlineStyle)?.[1] ?? ''
    const radius = /border-radius:\s*(\d+px)/.exec(label)?.[1]
    const control = /--of-radius:\s*(\d+px)/.exec(CSS)?.[1]
    expect(control).toBeDefined()
    expect(radius).toBe(control)
  })

  /*
   * The splash's fades are the product's own motion, written as literals for
   * the same reason as its colours. They were 220ms and 320ms `ease-out`, off
   * the scale and off the curve every other surface uses.
   */
  it('moves on the product’s curve and its settle duration', () => {
    const settle = /--of-settle:\s*(\d+ms)/.exec(CSS)?.[1]
    const ease = /--of-ease:\s*(cubic-bezier\([^)]*\))/.exec(CSS)?.[1]
    const transitions = [...inlineStyle.matchAll(/transition:\s*opacity ([^;]+);/g)].map(
      (match) => match[1],
    )
    expect(transitions.length).toBeGreaterThan(0)
    for (const transition of transitions) expect(transition).toBe(`${settle ?? ''} ${ease ?? ''}`)

    const script = readFileSync(resolve(process.cwd(), 'src/app/splash.ts'), 'utf8')
    expect(/const FADE_MS = (\d+)/.exec(script)?.[1]).toBe(settle?.replace('ms', ''))
  })

  /*
   * The label promises a board only where one opens. The inline check cannot
   * import the router, so its two patterns are held to the router's own.
   */
  it('recognises a board link exactly as the router does', () => {
    const source = (path: string, name: string): string => {
      const file = readFileSync(resolve(process.cwd(), path), 'utf8')
      const found = new RegExp(`const ${name} = (/[^\\n]+/)\\n`).exec(file)?.[1]
      if (found === undefined) throw new Error(`${name} not found in ${path}`)
      return found
    }
    expect(HTML).toContain(
      `room !== null && ${source('src/app/collab-config.ts', 'SHARED_ID')}.test(room)`,
    )
    expect(HTML).toContain(
      `board !== null && ${source('src/app/route.ts', 'LOCAL_ID')}.test(board)`,
    )
  })

  /** The label's scrim is the void at 82%, written in channels rather than hex. */
  it('writes the scrim from the same void the background uses', () => {
    const scrim = /rgb\((\d+) (\d+) (\d+) \/ \d+%\)/.exec(inlineStyle)
    expect(scrim).not.toBeNull()

    const void_ = token('brand-void')
    const channels = [1, 3, 5].map((i) => Number.parseInt(void_.slice(i, i + 2), 16))
    expect([Number(scrim?.[1]), Number(scrim?.[2]), Number(scrim?.[3])]).toEqual(channels)
  })

  it('tells the browser chrome the same colour', () => {
    const meta = /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/.exec(HTML)?.[1]
    expect(meta?.toLowerCase()).toBe(token('brand-void'))
  })

  /**
   * Nothing in `public/` — Vite copies that directory into every build, which is
   * how 4.7MB of benchmark boards nearly shipped. Brand assets go through the
   * bundler like any other import, so they are hashed and only the referenced
   * ones survive.
   */
  it('references assets that exist, and none of them from public/', () => {
    /*
     * `srcset` as well as `src`. The splash ships two widths now, and a reader
     * that only knew about `src` would have let the 2x file be renamed, moved
     * or deleted without a word — an unchecked reference is the whole failure
     * mode this test exists for.
     */
    const single = [...HTML.matchAll(/(?:src|href)="(\/src\/assets\/[^"]+)"/g)].map((m) => m[1])
    const sets = [...HTML.matchAll(/srcset="([^"]+)"/g)].flatMap((m) =>
      (m[1] ?? '')
        .split(',')
        .map((candidate) => candidate.trim().split(/\s+/)[0])
        .filter((path): path is string => path?.startsWith('/src/assets/') === true),
    )

    const referenced = [...new Set([...single, ...sets])]
    expect(referenced.length).toBeGreaterThanOrEqual(4)
    // The guard above is only worth anything if a srcset was actually read.
    expect(sets.length).toBeGreaterThan(0)

    for (const path of referenced) {
      expect(path).not.toContain('/public/')
      expect(
        existsSync(resolve(process.cwd(), `.${String(path)}`)),
        `missing ${String(path)}`,
      ).toBe(true)
    }
    expect(existsSync(resolve(process.cwd(), 'public'))).toBe(false)
  })

  /**
   * The backdrop is inlined, not fetched. A loading screen that waits on the
   * network to show that it is loading has the logic backwards, and this is the
   * assertion that stops someone "tidying" the data URI into a file.
   */
  it('inlines its own first frame', () => {
    const lqip = /url\('(data:image\/webp;base64,[^']+)'\)/.exec(inlineStyle)?.[1]
    expect(lqip).toBeDefined()
    expect((lqip ?? '').length).toBeLessThan(2048)
  })
})
