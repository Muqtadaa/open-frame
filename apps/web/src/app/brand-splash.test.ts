import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The splash is the one place a colour is allowed to be written twice.
 *
 * It has to paint at first paint, before any stylesheet has loaded, so its
 * critical CSS lives inline in `index.html` as literal values — outside the
 * reach of `design-tokens.test.ts`, which only reads `styles.css`. That is a
 * second source of truth for the brand, and a second source of truth drifts.
 *
 * So it is pinned here instead: every colour in the document's inline style has
 * to BE one of the tokens, and the assets it names have to exist. Changing a
 * brand token now either changes the splash or fails the build.
 */
const HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const CSS = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

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

  it('paints only in brand colours', () => {
    const allowed = new Set([token('brand-void'), afterHoursToken('ink')])
    const used = (inlineStyle.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((hex) => hex.toLowerCase())

    expect(used.length).toBeGreaterThan(0)
    for (const hex of used) expect(allowed).toContain(hex)
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
    const referenced = [...HTML.matchAll(/(?:src|href)="(\/src\/assets\/[^"]+)"/g)].map((m) => m[1])
    expect(referenced.length).toBeGreaterThanOrEqual(3)

    for (const path of referenced) {
      expect(path).not.toContain('/public/')
      expect(existsSync(resolve(process.cwd(), `.${String(path)}`)), `missing ${String(path)}`).toBe(
        true,
      )
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
