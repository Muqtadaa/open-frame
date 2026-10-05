import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readStyles } from '../styles/read-styles.js'

/**
 * The stylesheet says what the app is, and nothing else (audit 2026-09-27).
 *
 * Five thousand lines drift in ways no screenshot shows: rules for markup that
 * no longer exists, the same selector argued in three places, a weight or a
 * face written out where a token was meant. Each of these reads the source as
 * it is and fails on the drift, so it cannot quietly come back.
 */
const ROOT = process.cwd()
const CSS = readStyles()
const PLAIN = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

function sources(): string {
  const files = readdirSync(resolve(ROOT, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => join('src', file))
  return [...files, 'index.html']
    .map((file) => readFileSync(resolve(ROOT, file), 'utf8'))
    .join('\n')
}

describe('the stylesheet', () => {
  /*
   * A class is in use when some source names it — whole, or as the prefix a
   * template finishes (`of-size--${size}`). One nothing names is a rule for
   * markup that is gone, and it misleads the next person to read it into
   * thinking that markup is still there to be styled.
   */
  it('styles only classes the app renders', () => {
    const source = sources()
    const styled = new Set([...PLAIN.matchAll(/\.(of-[\w-]+)/g)].map((match) => match[1] ?? ''))
    // Not vacuous: the app's own classes are read.
    expect(styled.size).toBeGreaterThan(300)

    const prefixes = (name: string): string[] =>
      [...name.matchAll(/-/g)].map((match) => name.slice(0, (match.index ?? 0) + 1))
    const dead = [...styled].filter(
      (name) =>
        !source.includes(name) && !prefixes(name).some((prefix) => source.includes(`${prefix}\${`)),
    )
    expect(dead).toEqual([])
  })

  /*
   * One stack per face, named once. The face picker drew its "serif" specimen
   * in one stack while the board set a serif note in another, so the sample
   * could show a face the note would never get; the code block and the body
   * spelled out stacks the tokens already held.
   */
  it('sets every face from a token', () => {
    const families = [...PLAIN.matchAll(/font-family:\s*([^;]+);/g)].map((match) =>
      (match[1] ?? '').trim(),
    )
    expect(families.length).toBeGreaterThan(20)
    expect(families.filter((family) => !/^var\(--of-[\w-]+\)$|^inherit$/.test(family))).toEqual([])
  })

  it('gives the board the same faces as the interface', () => {
    const tokens = readFileSync(resolve(ROOT, 'src/scene/style-tokens.ts'), 'utf8')
    const body = /export function fontFamily[\s\S]*?\n}/.exec(tokens)?.[0] ?? ''
    expect(body).toContain("'var(--of-serif)'")
    expect(body).toContain("'var(--of-mono)'")
    expect(CSS).toContain('--of-serif:')
  })

  /*
   * Weights are four decisions, not a number typed wherever it was wanted.
   */
  it('sets every weight from a token', () => {
    const weights = [...PLAIN.matchAll(/font-weight:\s*([^;]+);/g)].map((match) =>
      (match[1] ?? '').trim(),
    )
    expect(weights.length).toBeGreaterThan(20)
    expect(
      weights.filter((weight) => !/^var\(--of-weight-[a-z]+\)$|^inherit$/.test(weight)),
    ).toEqual([])
  })

  /*
   * A selector is argued in ONE place. Split across a stylesheet this long, a
   * second block reads as the whole story to whoever finds it first — the
   * inspector's positioning context sat seventy lines below its layout, a
   * swatch's shape three thousand. Motion is the exception by design: the
   * motion section keeps every animation together so it can be read as one
   * thesis, so a block that only moves things may repeat a selector.
   */
  it('argues each selector in one place, motion aside', () => {
    const MOTION =
      /^(animation|transition|transform-origin|will-change)[\w-]*$|^--of-(ease|quick|settle|hold|stagger|dwell)$/
    const blocks = new Map<string, number>()
    const walk = (text: string, context: string): void => {
      let at = 0
      while (at < text.length) {
        const open = text.indexOf('{', at)
        if (open < 0) return
        const selector = text.slice(at, open).trim().replace(/\s+/g, ' ')
        let depth = 1
        let close = open + 1
        while (depth > 0 && close < text.length) {
          if (text[close] === '{') depth++
          else if (text[close] === '}') depth--
          close++
        }
        const body = text.slice(open + 1, close - 1)
        if (/^@(media|supports|container)/.test(selector)) walk(body, `${context}${selector} `)
        else if (!selector.startsWith('@')) {
          const properties = [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map((m) => m[1] ?? '')
          if (!properties.every((property) => MOTION.test(property))) {
            const key = `${context}${selector}`
            blocks.set(key, (blocks.get(key) ?? 0) + 1)
          }
        }
        at = close
      }
    }
    walk(PLAIN, '')
    // Not vacuous: the whole sheet was walked, media queries included.
    expect(blocks.size).toBeGreaterThan(500)
    expect([...blocks].filter(([, count]) => count > 1).map(([key]) => key)).toEqual([])
  })
})
