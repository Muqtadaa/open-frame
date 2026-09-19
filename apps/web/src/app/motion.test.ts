import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every animation that MOVES something has a reduced-motion path.
 *
 * PRODUCT.md commits to WCAG 2.2 AA, and 2.3.3 is the one that is easy to
 * honour once and then lose: somebody adds a keyframe six months from now and
 * nothing anywhere says it was supposed to have an alternative. This reads the
 * real stylesheet, the same way `design-tokens.test.ts` reads it for contrast.
 *
 * Reduced motion means fewer and gentler, not none — so what is asserted is
 * that a moving animation is REPLACED under the preference, never that the
 * preference switches animation off. An interface that stops acknowledging a
 * copied link under this setting has traded an accessibility preference for a
 * loss of information.
 */

/*
 * Comments stripped first. A CSS rule is "everything since the last brace",
 * so a commented rule hands the selector parser the comment as well — which is
 * how the first run of this reported `* eleven beats late is a list that feels
 * slow` as an unhandled animation.
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/**
 * EVERY reduced-motion block, not the first.
 *
 * The first version of this test took one, and the stylesheet already had an
 * older one for the tool tip — so it read that, found no answer for anything
 * on the front door, and would have gone on reading it forever. This is the
 * second time a test here has been written to read only the first of
 * something; `design-tokens.test.ts` has the same note about themes.
 *
 * Braces are matched rather than pattern-guessed, because a media block
 * contains nested rules and `[\s\S]*?\n\}` stops at the first of them.
 */
function reducedMotionBlocks(): string {
  const marker = '@media (prefers-reduced-motion: reduce)'
  const blocks: string[] = []

  let from = CSS.indexOf(marker)
  while (from !== -1) {
    const open = CSS.indexOf('{', from)
    let depth = 0
    let index = open
    for (; index < CSS.length; index += 1) {
      if (CSS[index] === '{') depth += 1
      else if (CSS[index] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    blocks.push(CSS.slice(open + 1, index))
    from = CSS.indexOf(marker, index)
  }

  return blocks.join('\n')
}

/** The stylesheet with every reduced-motion block removed. */
function ordinaryRules(): string {
  let out = CSS
  const marker = '@media (prefers-reduced-motion: reduce)'
  let from = out.indexOf(marker)
  while (from !== -1) {
    const open = out.indexOf('{', from)
    let depth = 0
    let index = open
    for (; index < out.length; index += 1) {
      if (out[index] === '{') depth += 1
      else if (out[index] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    out = out.slice(0, from) + out.slice(index + 1)
    from = out.indexOf(marker)
  }
  return out
}

/** Keyframes whose body moves something, as opposed to fading or tinting it. */
function movingKeyframes(): readonly string[] {
  const names: string[] = []
  for (const match of CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, name = '', body = ''] = match
    if (body.includes('transform:')) names.push(name)
  }
  return names
}

/** The selectors that run a given animation, outside the reduced-motion block. */
function selectorsUsing(name: string): readonly string[] {
  const outside = ordinaryRules()
  const found: string[] = []
  for (const match of outside.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector = '', body = ''] = match
    if (new RegExp(`animation(-name)?:[^;]*\\b${name}\\b`).test(body)) {
      for (const part of selector.split(',')) found.push(part.trim())
    }
  }
  return found
}

describe('motion', () => {
  it('has animations at all, so this suite cannot pass by finding none', () => {
    // The failure mode every guard in this repository has hit at least once.
    expect(movingKeyframes().length).toBeGreaterThan(0)
  })

  it('answers prefers-reduced-motion', () => {
    expect(reducedMotionBlocks().length).toBeGreaterThan(0)
  })

  it('gives every moving animation a reduced-motion alternative', () => {
    const reduced = reducedMotionBlocks()

    const unhandled: string[] = []
    for (const name of movingKeyframes()) {
      for (const selector of selectorsUsing(name)) {
        // The selector itself, or one it is part of, must be re-pointed at a
        // gentler animation under the preference.
        const key = selector.replace(/\[[^\]]*\]/g, '').trim()
        if (!reduced.includes(key)) unhandled.push(`${selector} runs ${name}`)
      }
    }

    expect(unhandled).toEqual([])
  })

  /**
   * Movement is what goes; the rest is what stays. A reduced-motion block full
   * of `animation: none` would pass the test above while silently removing the
   * feedback it was meant to preserve.
   */
  it('replaces movement rather than switching animation off', () => {
    const reduced = reducedMotionBlocks()

    expect(reduced).not.toMatch(/animation:\s*none/)
    expect(reduced).toMatch(/animation-name:/)
  })
})
