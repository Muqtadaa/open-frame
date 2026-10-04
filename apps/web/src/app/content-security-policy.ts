/**
 * The page's Content Security Policy, written into the built `index.html`.
 *
 * Built at BUILD time rather than declared in `vercel.json`, for two reasons
 * that only hold together:
 *
 * - The origins the page talks to are this build's own configuration
 *   (`VITE_SUPABASE_URL`, `VITE_COLLAB_URL`), which a static header file
 *   cannot read. A fork or a preview with another room server would ship a
 *   policy that blocked its own sockets.
 * - `index.html` runs three inline scripts and one inline `onload` BEFORE the
 *   application exists — the splash and its watchdog, whose whole job is to
 *   work when the bundle does not arrive. They are allowed by hash, so the
 *   hashes have to be taken from the HTML that actually ships, after Vite
 *   has finished with it. A hand-maintained list would drift the first time
 *   somebody edited a comment inside one of them.
 *
 * What a `<meta>` policy cannot carry is `frame-ancestors`, which browsers
 * ignore there; that one is a header, in `vercel.json`, with the rest of the
 * static headers.
 *
 * Pure: the caller supplies the hash, so this module stays free of `node:`
 * imports and is tested like everything else.
 */

export interface PolicyInput {
  /** The built HTML, exactly as it will be served. */
  readonly html: string
  /** `VITE_SUPABASE_URL`, or null for a build with no accounts. */
  readonly supabaseUrl: string | null
  /** `VITE_COLLAB_URL` (ws, wss, http or https), or null for a build that does not collaborate. */
  readonly collabUrl: string | null
  /** Base64 SHA-256 of a UTF-8 string. */
  readonly sha256: (text: string) => string
}

/** The inline `<script>` bodies in `html` — those without a `src`. */
export function inlineScripts(html: string): string[] {
  const scripts: string[] = []
  for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1] ?? ''
    if (/\ssrc\s*=/i.test(attributes)) continue
    scripts.push(match[2] ?? '')
  }
  return scripts
}

/**
 * The values of inline event handler attributes (`onload="…"`), decoded.
 *
 * A browser hashes the attribute's VALUE, after entity decoding, so a handler
 * written with `&quot;` must be decoded here or its hash never matches.
 */
export function inlineHandlers(html: string): string[] {
  const handlers: string[] = []
  for (const match of html.matchAll(/\son[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    handlers.push(decodeEntities(match[2] ?? match[3] ?? ''))
  }
  return handlers
}

function decodeEntities(text: string): string {
  const decoded = text
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
  // Anything else would hash differently from what the browser sees, and
  // fail silently in production as a splash that never fades in.
  if (/&[#a-z0-9]+;/i.test(decoded)) {
    throw new Error(`An inline handler uses an entity this policy cannot decode: ${text}`)
  }
  return decoded
}

/** `wss://host/path` → `wss://host`; null for anything that is not a URL. */
function originOf(url: string): string | null {
  try {
    const origin = new URL(url).origin
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

/**
 * Both schemes of an origin: a room server is configured as a websocket URL
 * and also answered over HTTP (claim, password, images), and Supabase is the
 * other way round — HTTP, plus a websocket for live comments.
 */
function bothSchemes(url: string | null): string[] {
  if (url === null) return []
  const origin = originOf(url)
  if (origin === null) return []
  const secure = /^(https|wss):/.test(origin)
  const host = origin.replace(/^[a-z]+:\/\//, '')
  return secure ? [`https://${host}`, `wss://${host}`] : [`http://${host}`, `ws://${host}`]
}

export function contentSecurityPolicy(input: PolicyInput): string {
  const hash = (text: string) => `'sha256-${input.sha256(text)}'`
  const scripts = inlineScripts(input.html).map(hash)
  const handlers = inlineHandlers(input.html).map(hash)
  const rooms = bothSchemes(input.collabUrl)
  const identity = bothSchemes(input.supabaseUrl)
  const roomImages = rooms.filter((origin) => /^https?:/.test(origin))

  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      ...scripts,
      // Lets a hash match an event handler attribute — the splash artwork's
      // `onload` — and nothing more: no handler without a listed hash runs.
      ...(handlers.length > 0 ? ["'unsafe-hashes'", ...handlers] : []),
    ],
    // React writes `style` attributes for every positioned object on the
    // board, and the splash's critical CSS is an inline block. Hashing the
    // first is impossible (the values move with the viewport) and a policy
    // that broke rendering would be removed rather than kept.
    ['style-src', "'self'", "'unsafe-inline'"],
    // `data:` for the splash's inlined thumbnail, `blob:` for images held in
    // IndexedDB, the room server for images on a shared board.
    ['img-src', "'self'", 'data:', 'blob:', ...roomImages],
    ['connect-src', "'self'", ...rooms, ...identity],
    /*
     * Session music streams from the room server (ADR 0017). Without this the
     * browser falls back to `default-src` and refuses every track.
     */
    ['media-src', "'self'", ...roomImages],
    ['font-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'self'"],
  ]
  return directives.map((parts) => [...new Set(parts)].join(' ')).join('; ')
}

/** `html` with the policy as the first thing in its head, ahead of every script. */
export function withPolicy(html: string, policy: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`
  const charset = /<meta charset="[^"]*"\s*\/?>/i.exec(html)
  if (charset === null)
    throw new Error('index.html has no <meta charset>; the policy has nowhere to go')
  const at = charset.index + charset[0].length
  return `${html.slice(0, at)}\n    ${meta}${html.slice(at)}`
}
