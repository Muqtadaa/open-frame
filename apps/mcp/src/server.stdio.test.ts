import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { READ_TOOLS } from './tools/read.js'

/**
 * The server, spoken to the way an agent speaks to it.
 *
 * A real client, a real stdio transport and a real child process — which is
 * the half that cannot be checked by calling a function: that the tools are
 * registered under the names an agent will use, that their arguments survive
 * the trip as JSON Schema, and that a response comes back as content rather
 * than as a crash.
 *
 * Signed out ON PURPOSE. `XDG_CONFIG_HOME` points at an empty directory, so
 * this never reaches Supabase and never touches whoever is running it: what
 * is proved here is the protocol, and what a signed-in session adds is proved
 * against a real room in `tools/read.test.ts`.
 */

const SERVER = fileURLToPath(new URL('./server.ts', import.meta.url))

let client: Client

beforeAll(async () => {
  client = new Client({ name: 'openframe-test', version: '0.0.0' })
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', SERVER],
      env: {
        PATH: process.env.PATH ?? '',
        // An empty config directory: no session, no network, nobody's account.
        XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'openframe-stdio-')),
      },
    }),
  )
}, 60_000)

afterAll(async () => {
  await client.close()
})

describe('the server over stdio', () => {
  it('offers exactly the tools this build has', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      READ_TOOLS.map((tool) => tool.name).sort(),
    )
  })

  /**
   * A read tool says so, so a client can call it without stopping to ask
   * somebody — the difference between an agent that can look something up and
   * one that interrupts to do it.
   */
  it('says which of them only read', async () => {
    const { tools } = await client.listTools()
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} does not say it is read-only`).toBe(true)
    }
  })

  it('carries each tool’s arguments across as a schema', async () => {
    const { tools } = await client.listTools()
    const objects = tools.find((tool) => tool.name === 'get_objects')
    expect(objects?.inputSchema.required).toEqual(['board'])
    expect(Object.keys(objects?.inputSchema.properties ?? {}).sort()).toEqual([
      'board',
      'cursor',
      'ids',
      'limit',
      'type',
    ])
  })

  it('answers a call, and says what to do when nobody has signed in', async () => {
    const answer = (await client.callTool({ name: 'list_boards', arguments: {} })) as {
      content: { type: string; text: string }[]
      isError?: boolean
    }
    expect(answer.isError).toBe(true)
    expect(answer.content[0]?.text).toMatch(/not signed in/i)
  })
})
