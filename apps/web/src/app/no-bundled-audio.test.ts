import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No audio ships in the web app.
 *
 * Session music streams from the room server's library (ADR 0017), and the
 * timer's chime is synthesised (`ui/chime.ts`). A track that crept into the
 * app would be downloaded by everybody who opened a board, whether or not
 * anyone pressed play — the mistake rule 12 records for benchmark fixtures,
 * which once nearly shipped 4.7MB to users.
 */
const WEB = resolve(process.cwd())
const AUDIO = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|weba)$/i
const SKIP = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', '.vite'])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

describe('the web app', () => {
  it('carries no audio file of its own', () => {
    expect(
      files(WEB)
        .filter((path) => AUDIO.test(path))
        .map((path) => relative(WEB, path)),
    ).toEqual([])
  })
})
