import { asBoardId } from '@openframe/core'

import { openBoard } from './board.js'

/**
 * The peer, by hand.
 *
 * Stage 1 has no tools and no transport yet, so this is how it is DEMONSTRATED
 * rather than merely tested: point it at a room, watch the board arrive, and
 * optionally put a note on it that everybody looking at that board sees appear.
 *
 *   pnpm --filter @openframe/mcp peer \
 *     --server ws://127.0.0.1:8787 --board brd_… [--key <link key>] [--note "text"]
 *
 * It prints what is ON the board and never what was needed to reach it: a key
 * echoed into a terminal is a key in a scrollback buffer, and stage 2's guard
 * — no token, key or session in any output — starts being true here rather
 * than being retrofitted once there is something to leak it into.
 */

interface Args {
  readonly server: string
  readonly board: string
  readonly key: string | null
  readonly note: string | null
}

function parse(argv: readonly string[]): Args {
  const values = new Map<string, string>()
  for (let at = 0; at < argv.length; at += 2) {
    const name = argv[at]
    const value = argv[at + 1]
    if (name === undefined || !name.startsWith('--') || value === undefined) continue
    values.set(name.slice(2), value)
  }
  const server = values.get('server') ?? 'ws://127.0.0.1:8787'
  const board = values.get('board')
  if (board === undefined) throw new Error('Which board? Pass --board brd_…')
  return { server, board, key: values.get('key') ?? null, note: values.get('note') ?? null }
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2))
  const peer = await openBoard({
    boardId: asBoardId(args.board),
    server: args.server,
    credentials: { key: args.key },
  })

  try {
    const board = peer.store.getDocument()
    console.log(`${board.meta.title} — ${String(board.objects.size)} object(s), joined as ${peer.role}`)
    const counts = new Map<string, number>()
    for (const object of board.objects.values()) {
      counts.set(object.type, (counts.get(object.type) ?? 0) + 1)
    }
    for (const [type, count] of [...counts].sort()) console.log(`  ${type}: ${String(count)}`)

    if (args.note !== null) {
      const made = peer.dispatcher.dispatch(
        {
          kind: 'CreateObjects',
          objects: [{ type: 'sticky', x: 0, y: 0, data: { text: [{ text: args.note }] } }],
        },
        { origin: 'mcp' },
      )
      if (!made.ok) throw new Error(made.error.message)
      console.log(`Added a note. Everybody on this board sees it now.`)
      // The dispatch reaches the room on the next turn of the loop; closing in
      // the same one would take the socket down with the change still on it.
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  } finally {
    peer.close()
  }
}

await main()

/*
 * Explicitly, because `close()` cannot promise the process is free: the room
 * does not always answer the closing handshake, so Node holds the socket's
 * handle and the tool would sit there having finished its work. See
 * `BoardPeer.close`.
 */
process.exit(0)
