import { createInterface } from 'node:readline/promises'
import { asBoardId } from '@openframe/core'

import { openBoard } from './board.js'
import { boardList, boardSummary, signedInAs, whoami } from './format.js'
import { ROOM_SERVER } from './project.js'
import { resume, signIn, signOut, SignInError } from './supabase/account.js'

/**
 * OpenFrame from a terminal, and the way this stage is DEMONSTRATED.
 *
 *   pnpm --filter @openframe/mcp cli login [--email you@example.com]
 *   pnpm --filter @openframe/mcp cli whoami
 *   pnpm --filter @openframe/mcp cli boards
 *   pnpm --filter @openframe/mcp cli peer --board brd_… [--note "text"]
 *   pnpm --filter @openframe/mcp cli logout
 *
 * `peer` is stage 1's proof with stage 2's half added: the board's key now
 * comes from the account rather than the command line, which is what makes the
 * reach of this tool exactly the reach of the person using it.
 *
 * Nothing here prints a token, a key or a session — `format.ts` holds that,
 * and holds it where it can be tested.
 */

interface Args {
  readonly command: string
  readonly options: ReadonlyMap<string, string>
}

function parse(argv: readonly string[]): Args {
  const [command = 'help', ...rest] = argv
  const options = new Map<string, string>()
  for (let at = 0; at < rest.length; at += 2) {
    const name = rest[at]
    const value = rest[at + 1]
    if (name === undefined || !name.startsWith('--') || value === undefined) continue
    options.set(name.slice(2), value)
  }
  return { command, options }
}

const USAGE = `openframe — an OpenFrame board from a terminal

  login [--email you@example.com]   sign in and remember it on this machine
  logout                            forget the session here
  whoami                            who this machine is signed in as
  boards                            the boards that account may open
  peer --board brd_… [--note text] [--server ws://…]
                                    join a board, say what is on it, optionally add a note`

/**
 * Reads a password without echoing it.
 *
 * Raw mode and a hand-rolled line reader, because `readline` has no way to
 * suppress the echo and the alternative — printing what somebody types into a
 * terminal they may be sharing — is not one.
 */
async function askSecret(question: string): Promise<string> {
  const input = process.stdin
  if (!input.isTTY) {
    throw new SignInError('A password has to be typed: run this in a terminal.')
  }

  process.stdout.write(question)
  input.setRawMode(true)
  input.resume()

  return new Promise<string>((resolve, reject) => {
    let typed = ''
    const done = (finish: () => void): void => {
      input.setRawMode(false)
      input.pause()
      input.off('data', onData)
      process.stdout.write('\n')
      finish()
    }

    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        switch (byte) {
          case 0x03: // Ctrl-C: the same as anywhere else in a terminal.
            done(() => {
              reject(new SignInError('Cancelled.'))
            })
            return
          case 0x0d:
          case 0x0a:
            done(() => {
              resolve(typed)
            })
            return
          case 0x7f:
          case 0x08:
            typed = typed.slice(0, -1)
            break
          default:
            // Printable only: an arrow key arrives as an escape sequence, and
            // three bytes of one in the middle of a password is a password
            // nobody can type twice.
            if (byte >= 0x20) typed += String.fromCharCode(byte)
        }
      }
    }

    input.on('data', onData)
  })
}

async function ask(question: string): Promise<string> {
  const lines = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await lines.question(question)).trim()
  } finally {
    lines.close()
  }
}

async function login(options: ReadonlyMap<string, string>): Promise<void> {
  const email = options.get('email') ?? (await ask('Email: '))
  const password = await askSecret('Password: ')

  const signedIn = await signIn(email, password)
  console.log(`Signed in as ${signedInAs(signedIn.account)}`)
  signedIn.close()
}

async function boards(): Promise<void> {
  const signedIn = await resume()
  if (signedIn === null) {
    console.log(whoami(null))
    return
  }
  console.log(boardList(await signedIn.boards()))
  signedIn.close()
}

async function peer(options: ReadonlyMap<string, string>): Promise<void> {
  const id = options.get('board')
  if (id === undefined) throw new Error('Which board? Pass --board brd_…')
  const boardId = asBoardId(id)

  /*
   * The key comes from the ACCOUNT. A board this person may not open has no
   * key here, and the room refuses the connection — which is the same answer
   * they would get in a browser, decided in the same place.
   */
  const signedIn = await resume()
  const known = signedIn === null ? null : await signedIn.board(boardId)
  signedIn?.close()

  const peerOn = await openBoard({
    boardId,
    server: options.get('server') ?? ROOM_SERVER,
    credentials: { key: known?.accessKey ?? null },
  })

  try {
    console.log(boardSummary(peerOn.store.getDocument(), peerOn.role))

    const note = options.get('note')
    if (note !== undefined) {
      const made = peerOn.dispatcher.dispatch(
        {
          kind: 'CreateObjects',
          objects: [{ type: 'sticky', x: 0, y: 0, data: { text: [{ text: note }] } }],
        },
        { origin: 'mcp' },
      )
      if (!made.ok) throw new Error(made.error.message)
      console.log('Added a note. Everybody on this board sees it now.')
      // The dispatch reaches the room on the next turn of the loop; closing in
      // the same one would take the socket down with the change still on it.
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  } finally {
    peerOn.close()
  }
}

async function main(): Promise<number> {
  const { command, options } = parse(process.argv.slice(2))

  switch (command) {
    case 'login':
      await login(options)
      return 0
    case 'logout':
      await signOut()
      console.log('Signed out on this machine.')
      return 0
    case 'whoami': {
      const signedIn = await resume()
      console.log(whoami(signedIn?.account ?? null))
      signedIn?.close()
      return 0
    }
    case 'boards':
      await boards()
      return 0
    case 'peer':
      await peer(options)
      return 0
    default:
      console.log(USAGE)
      return command === 'help' ? 0 : 1
  }
}

const code = await main().catch((reason: unknown) => {
  console.error(reason instanceof Error ? reason.message : String(reason))
  return 1
})

/*
 * Explicitly, because closing a board cannot promise the process is free: the
 * room does not always answer the closing handshake, so Node holds the
 * socket's handle and the tool would sit there having finished its work. See
 * `BoardPeer.close`.
 */
process.exit(code)
