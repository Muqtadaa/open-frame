import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { resume } from './supabase/account.js'
import { toolContext } from './tools/context.js'
import { READ_TOOLS } from './tools/read.js'
import { WRITE_TOOLS } from './tools/write.js'

/**
 * OpenFrame as an MCP server, over stdio.
 *
 * Transport and nothing else. Every tool is a `ToolDefinition` that knows
 * nothing about MCP, which is what stage 5 rests on: putting an HTTP endpoint
 * in front of these is a second file like this one, not a second
 * implementation of the tools.
 *
 * **Nothing here may write to stdout.** The protocol IS stdout on this
 * transport, so one stray `console.log` puts a line of English in the middle
 * of a JSON-RPC stream and the client drops the connection with a parse error
 * that names neither this file nor the log. Diagnostics go to stderr, and
 * `server.test.ts` fails the build if that slips.
 *
 * Signed out is not a refusal to start. A server that exited because nobody
 * had run `login` would appear in the client as a server that failed, with
 * nothing to say why; it starts, and every tool answers with what to do.
 */

async function main(): Promise<void> {
  const account = await resume()
  const context = toolContext(account)

  const server = new McpServer({ name: 'openframe', version: '0.1.0' })

  for (const tool of [...READ_TOOLS, ...WRITE_TOOLS]) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        /*
         * Said out loud, because it decides whether a client stops to ask a
         * person. A tool that cannot change anything can be called freely —
         * the difference between an agent that looks something up and one
         * that interrupts to do it — and one that deletes should be asked
         * about, which is the client's decision to make and its business to
         * be told.
         */
        annotations: {
          readOnlyHint: tool.writes !== true,
          destructiveHint: tool.destructive === true,
          openWorldHint: false,
        },
      },
      async (input: unknown) => {
        const answer = await tool.run(input, context)
        return {
          content: [{ type: 'text' as const, text: answer.text }],
          isError: answer.isError,
        }
      },
    )
  }

  const closing = async (): Promise<void> => {
    await context.close()
    await server.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void closing())
  process.on('SIGTERM', () => void closing())

  await server.connect(new StdioServerTransport())
  // stderr, never stdout: see above.
  process.stderr.write(
    account === null
      ? 'openframe: no session on this machine — run `openframe login` and restart.\n'
      : `openframe: signed in as ${account.account.displayName}\n`,
  )
}

await main()
