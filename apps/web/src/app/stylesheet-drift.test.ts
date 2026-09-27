import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The stylesheet says what the app is, and nothing else (audit 2026-09-27).
 *
 * Five thousand lines drift in ways no screenshot shows: rules for markup that
 * no longer exists, the same selector argued in three places, a weight or a
 * face written out where a token was meant. Each of these reads the source as
 * it is and fails on the drift, so it cannot quietly come back.
 */
const ROOT = process.cwd()
const CSS = readFileSync(resolve(ROOT, 'src/styles.css'), 'utf8')
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
})
