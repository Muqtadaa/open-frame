/**
 * Puts the catalogue's tracks into the music library (ADR 0017).
 *
 *   pnpm music:upload <folder of files> [--local]
 *
 * Each track is looked for as `<folder>/<id>.<mp3|ogg|wav>`, checked against
 * its catalogue entry — size, then SHA-256 — and only then uploaded. Nothing
 * is uploaded if any file fails, so the library never holds half of a change.
 * `--local` fills the development library `wrangler dev` reads.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { readCatalogue } from '@openframe/core/facilitation'

import { checkTrack, uploadCommand } from './tracks.js'

const EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
}

const args = process.argv.slice(2)
const local = args.includes('--local')
const folder = args.find((arg) => !arg.startsWith('--'))
if (folder === undefined) {
  console.error('usage: pnpm music:upload <folder of track files> [--local]')
  process.exit(2)
}

const rooms = resolve(import.meta.dirname, '../../apps/rooms')
const catalogue = readCatalogue(
  JSON.parse(readFileSync(join(rooms, 'src/library/catalogue.json'), 'utf8')),
)
if (catalogue === null || catalogue.tracks.length === 0) {
  console.error('The catalogue lists no tracks; add the approved ones first.')
  process.exit(1)
}

const ready: { track: (typeof catalogue.tracks)[number]; file: string }[] = []
const problems: string[] = []
for (const track of catalogue.tracks) {
  const file = resolve(folder, `${track.id}.${EXTENSIONS[track.mime] ?? 'mp3'}`)
  if (!existsSync(file)) {
    problems.push(`${track.id}: no file at ${file}`)
    continue
  }
  const problem = checkTrack(track, new Uint8Array(readFileSync(file)))
  if (problem === null) ready.push({ track, file })
  else problems.push(problem)
}
if (problems.length > 0) {
  console.error(['Nothing uploaded:', ...problems].join('\n  '))
  process.exit(1)
}

for (const { track, file } of ready) {
  execFileSync('pnpm', ['exec', 'wrangler', ...uploadCommand(track, file, local)], {
    cwd: rooms,
    stdio: 'inherit',
  })
}
console.log(`Uploaded ${String(ready.length)} tracks${local ? ' to the local library' : ''}.`)
