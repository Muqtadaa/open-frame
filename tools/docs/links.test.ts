/**
 * The documentation's own pointers hold.
 *
 * Every relative link between the docs resolves, and every pointer that sends
 * a reader to "the current audit" names the newest one. Five review documents
 * went on pointing at the 2026-10-02 audit for a week after the 2026-10-08 one
 * was written, because nothing read them — the same way DESIGN.md said a
 * twelve-pixel floor while the stylesheet said eleven.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, it } from 'node:test'

const ROOT = join(import.meta.dirname, '../..')

function markdownUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...markdownUnder(path))
    else if (name.endsWith('.md')) out.push(path)
  }
  return out
}

const FILES = [
  ...markdownUnder(join(ROOT, 'docs')),
  ...['README.md', 'PRODUCT.md', 'DESIGN.md', 'CLAUDE.md'].map((name) => join(ROOT, name)),
]

/**
 * A file's text with fenced code blanked: a link in an example is not a link.
 * Its lines stay, so a failure names the line the link is really on.
 */
function prose(path: string): string {
  return readFileSync(path, 'utf8').replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/[^\n]/g, ''),
  )
}

/** Relative links, as `[line, target]`, without their `#fragment`. */
function relativeLinks(text: string): [number, string][] {
  const found: [number, string][] = []
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = (match[1] ?? '').split('#')[0] ?? ''
      if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      found.push([index + 1, target])
    }
  })
  return found
}

const AUDIT = /audit-(\d{4}-\d{2}-\d{2})\.md/

const newestAudit = readdirSync(join(ROOT, 'docs/reviews'))
  .filter((name) => AUDIT.test(name))
  .sort()
  .at(-1)

void describe('the documentation', () => {
  void it('reads something, so neither check can pass on nothing', () => {
    assert.ok(FILES.length > 20)
    assert.ok(newestAudit !== undefined)
  })

  void it('links only to files that exist', () => {
    const broken: string[] = []
    for (const file of FILES) {
      for (const [line, target] of relativeLinks(prose(file))) {
        if (!existsSync(join(dirname(file), decodeURIComponent(target)))) {
          broken.push(`${relative(ROOT, file)}:${String(line)} → ${target}`)
        }
      }
    }
    assert.deepEqual(broken, [])
  })

  void it('sends a reader looking for the current audit to the newest one', () => {
    const stale: string[] = []
    for (const file of FILES) {
      prose(file)
        .split('\n')
        .forEach((line, index) => {
          if (!/current/i.test(line)) return
          for (const match of line.matchAll(new RegExp(AUDIT, 'g'))) {
            if (match[0] !== newestAudit) {
              stale.push(`${relative(ROOT, file)}:${String(index + 1)} → ${match[0]}`)
            }
          }
        })
    }
    assert.deepEqual(stale, [])
  })
})
