import type { RoomStatus } from '../hooks/use-room-status.js'
import type { SaveState } from '../runtime/context.js'

export interface SafetyWords {
  readonly label: string
  readonly tip: string
  /**
   * `away` when the room cannot be reached: said even where the bar is
   * short of room, because it changes what an edit means.
   */
  readonly tone: 'quiet' | 'away' | 'failed'
}

const LOCAL: Readonly<Record<SaveState, SafetyWords>> = {
  saved: { label: 'Saved', tip: 'Saved on this device', tone: 'quiet' },
  pending: { label: 'Saving…', tip: 'Saving on this device', tone: 'quiet' },
  saving: { label: 'Saving…', tip: 'Saving on this device', tone: 'quiet' },
  failed: {
    label: 'Not saved',
    tip: 'The last change was not saved on this device. Keep this tab open.',
    tone: 'failed',
  },
  'read-only': {
    label: 'Read-only',
    tip: 'This board could not be fully read, so changes are not saved',
    tone: 'quiet',
  },
}

const AWAY_TIP =
  'The room is out of reach. Changes are kept on this device and sent when it answers.'
const RECONNECTING_TIP =
  'Reconnecting to the room. Changes are kept on this device and sent when it answers.'

/**
 * Whether the work is safe, in one readout: the copy on this device and, on
 * a shared board, whether everybody else is getting it.
 *
 * These were two things on the bar — "Saved" by the name and a "Shared" chip
 * with a dot among the people — and the chip was also the share button, so
 * one control said whether the room was up AND handed out links. Being
 * offline is a fact about safety, so it is said here, beside "Saved".
 */
export function safetyWords(save: SaveState, room: RoomStatus | null): SafetyWords {
  // A failure, or a board that is never written, says so whatever the room.
  if (room === null || save === 'failed' || save === 'read-only') return LOCAL[save]
  const settled = save === 'saved'
  if (room === 'connected') {
    return settled
      ? {
          label: 'Saved · Live',
          tip: 'Saved on this device, and everyone on the board has it',
          tone: 'quiet',
        }
      : LOCAL[save]
  }
  /*
   * Reconnecting and offline are one fact for the work — nobody else is
   * getting it — so they read the same; the dot's colour and the tip say
   * which. "Reconnecting" was also the widest word on a phone's bar.
   */
  return {
    label: settled ? 'Offline · saved here' : 'Offline · saving…',
    tip: room === 'connecting' ? RECONNECTING_TIP : AWAY_TIP,
    tone: 'away',
  }
}
