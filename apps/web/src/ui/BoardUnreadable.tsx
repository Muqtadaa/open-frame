import { useRef } from 'react'

import type { QuarantineReason } from '@openframe/core'

import { useOpenFrame, type Quarantine } from '../runtime/context.js'
import { Gate, GateActions, GateBody } from './Gate.js'

/**
 * Why a board would not open, as its owner would put it.
 *
 * The codes are the program talking to itself. "newer-schema" told somebody
 * nothing; that a newer OpenFrame saved it tells them what to do.
 */
const WHY: Readonly<Record<QuarantineReason, string>> = {
  'newer-schema':
    'was saved by a newer version of OpenFrame than this one. Reloading the page usually brings in the newer version, and then it opens.',
  'migration-failed':
    'was saved by an older version of OpenFrame, and could not be brought up to date.',
  unparseable: 'is stored in a form this version cannot read.',
  'invalid-envelope': 'is stored in a form this version cannot read.',
  'invalid-payload': 'has something in it this version cannot read.',
}

function describe(quarantine: Quarantine): string {
  const name = quarantine.title === null ? 'This board' : `“${quarantine.title}”`
  const size =
    quarantine.objects === null
      ? ''
      : `, with ${String(quarantine.objects)} ${quarantine.objects === 1 ? 'object' : 'objects'} on it,`
  return `${name}${size} ${WHY[quarantine.reason]}`
}

/** A file name somebody would recognise in their downloads. */
function fileName(title: string | null): string {
  const slug = (title ?? 'board')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug === '' ? 'board' : slug}.openframe.json`
}

/**
 * A board this build could not read (rule 7).
 *
 * It opened as an EMPTY board — the ground, every tool, nothing on it — under
 * a banner reading "could not be opened (newer-schema)". Somebody who spent a
 * week on that board saw their work gone. It is not gone: the stored record is
 * untouched and nothing here will write to it. That is the first thing said,
 * and the one thing offered is a copy of it, exactly as stored.
 *
 * NOT DISMISSIBLE. Behind it is an empty ground; hiding the sheet would only
 * uncover the picture that caused the alarm.
 */
export function BoardUnreadable() {
  const { runtime } = useOpenFrame()
  const download = useRef<HTMLButtonElement>(null)
  const quarantine = runtime.quarantine
  if (quarantine === null) return null

  const save = (): void => {
    const blob = new Blob([JSON.stringify(quarantine.raw, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName(quarantine.title)
    link.click()
    // After the click has been handed to the browser, not before.
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 0)
  }

  return (
    <Gate
      heading="Your board is safe"
      testId="board-unreadable"
      role="dialog"
      initialFocus={download}
    >
      <GateBody>{describe(quarantine)} Nothing here will change it.</GateBody>
      <GateActions>
        <button
          ref={download}
          type="button"
          className="of-button of-button--primary"
          onClick={save}
        >
          Download a copy
        </button>
        <a className="of-button" href="/" data-testid="board-unreadable-exit">
          All boards
        </a>
      </GateActions>
    </Gate>
  )
}
