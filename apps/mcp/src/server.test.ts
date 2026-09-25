import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The one thing about the stdio server that cannot be found by running it.
 *
 * On this transport the protocol IS stdout. A `console.log` anywhere in the
 * server's own file puts a line of English in the middle of a JSON-RPC stream,
 * and what the client reports is a parse error naming neither the log nor this
 * file — so the guard is worth more than the running test it replaces.
 */
const SOURCE = readFileSync(new URL('./server.ts', import.meta.url), 'utf8')

/**
 * The CODE, with the comments taken out.
 *
 * The first version of this failed on the docstring that explains the rule —
 * the sentence warning about a stray `console.log` contains one. A guard that
 * reads source text has to read only the part that runs, or it is a guard
 * against writing things down.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('the stdio server', () => {
  it('never writes to stdout', () => {
    expect(CODE).not.toMatch(/console\.(log|info|debug|dir|table)\b/)
    expect(CODE).not.toMatch(/process\.stdout\.write/)
  })

  it('says how it is doing on stderr instead', () => {
    expect(CODE).toContain('process.stderr.write')
  })
})
