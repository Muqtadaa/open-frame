import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The network is reached through a port, never with the global `fetch`.
 *
 * Three use cases called the rooms worker directly, so the only way a test
 * could answer them was to replace the global — and nothing said which layer
 * was allowed to. Requests now live in adapters that are HANDED a `fetch`
 * (`room-client.ts`, `room-asset-store.ts`), and everything above them asks a
 * service. This scan is what keeps the next request from skipping the port.
 */
const SRC = resolve(process.cwd(), 'src')

/**
 * The one place above the adapters allowed to fetch, and why: the bench panel
 * reads this build's own fixture files, which are static assets of the page,
 * not a service anything else could stand in for (rule 12 keeps it out of
 * production builds).
 */
const EXEMPT = new Set(['ui/DevPanel.tsx'])

const LAYERS = ['app/', 'ui/', 'hooks/', 'canvas/', 'interaction/', 'views/', 'controls/']

function sources(): readonly string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.(test|fake)\.tsx?$/.test(file))
    .filter((file) => LAYERS.some((layer) => file.startsWith(layer)))
    .filter((file) => !EXEMPT.has(file))
}

// Blanks comments out line for line, so a violation is reported where it is.
const stripComments = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .replace(/^\s*\/\/.*$/gm, '')

describe('the layers above the adapters', () => {
  it('never call the global fetch', () => {
    const offenders = sources().flatMap((file) =>
      stripComments(readFileSync(join(SRC, file), 'utf8'))
        .split('\n')
        .flatMap((line, index) =>
          // A bare `fetch(`, not `options.fetch(` or `globalThis.fetch(`.
          /(^|[^.\w])fetch\(/.test(line) ? [`${file}:${String(index + 1)}`] : [],
        ),
    )
    expect(offenders).toEqual([])
  })
})
