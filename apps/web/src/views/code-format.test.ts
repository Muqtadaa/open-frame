import { describe, expect, it } from 'vitest'

import { CODE_LANGUAGES } from '@openframe/core'

import { canFormat, formatCode } from './code-format.js'

describe('the languages a real formatter handles', () => {
  it('reformats javascript rather than only indenting it', async () => {
    // Quote style and spacing inside the expression: nothing an indenter can
    // reach. This is the difference the split exists for.
    await expect(formatCode("const a = {b:1,c:'two'}", 'javascript')).resolves.toBe(
      'const a = { b: 1, c: "two" };',
    )
  })

  it('reformats typescript, types and all', async () => {
    await expect(formatCode('type A={b:string}', 'typescript')).resolves.toBe(
      'type A = { b: string };',
    )
  })

  it('reformats css', async () => {
    await expect(formatCode('a{color:red}', 'css')).resolves.toBe('a {\n  color: red;\n}')
  })

  it('reformats yaml, which the indenter refuses to touch', async () => {
    await expect(formatCode('a:   1', 'yaml')).resolves.toBe('a: 1')
  })

  it('leaves no trailing blank line for the reader to wonder about', async () => {
    const printed = await formatCode('const a = 1', 'javascript')
    expect(printed?.endsWith('\n')).toBe(false)
  })

  it('is idempotent, so pressing it twice changes nothing', async () => {
    const once = await formatCode("const a = {b:1,c:'two'}", 'javascript')
    expect(once).not.toBeNull()
    await expect(formatCode(once ?? '', 'javascript')).resolves.toBe(once)
  })
})

describe('falling back', () => {
  /*
   * Code on a whiteboard is very often a fragment, and a formatter that
   * refuses everything it cannot parse would be unavailable exactly where it
   * is most wanted.
   */
  it('indents javascript that does not parse instead of refusing it', async () => {
    const fragment = 'if (x) {\nreturn 1\n'
    // The trailing newline survives: an indenter decides indentation, and
    // silently dropping a line the author typed is not that.
    await expect(formatCode(fragment, 'javascript')).resolves.toBe('if (x) {\n  return 1\n')
  })

  it('indents a language no real formatter covers', async () => {
    await expect(formatCode('func f() {\nreturn 1\n}', 'go')).resolves.toBe(
      'func f() {\n  return 1\n}',
    )
  })

  it('does nothing to a language whose indentation is its syntax', async () => {
    await expect(formatCode('def f():\n        return 1', 'python')).resolves.toBeNull()
  })
})

describe('what the control is allowed to offer', () => {
  it('refuses the languages nothing can format', () => {
    expect(canFormat('python')).toBe(false)
    expect(canFormat('plain')).toBe(false)
  })

  it('offers the ones something can', () => {
    expect(canFormat('javascript')).toBe(true)
    expect(canFormat('yaml')).toBe(true)
    expect(canFormat('go')).toBe(true)
  })

  /*
   * The drift guard. `canFormat` answering `true` while `formatCode` returns
   * `null` is a button that does nothing — which is the specific failure the
   * enabled state exists to prevent, so it is checked against every language
   * offered rather than the handful named above.
   */
  it('never promises a language it then does nothing for', async () => {
    const sample = 'a {\nb\n}'
    for (const language of CODE_LANGUAGES) {
      if (!canFormat(language)) continue
      await expect(formatCode(sample, language)).resolves.not.toBeNull()
    }
  })
})
