/**
 * The architecture, made mechanical.
 *
 * Every rule here corresponds to a claim in docs/architecture/. A comment in a
 * file is a hope; this fails CI. The most important one by far is
 * `core-is-pure`: if the domain can reach React, a renderer, a CRDT or a
 * database, the promise that any of those can be replaced without rewriting
 * OpenFrame quietly stops being true.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependencies make modules impossible to reason about or test in isolation.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-pure',
      severity: 'error',
      comment:
        'packages/core must not depend on React, a renderer, a CRDT, an AI provider or a database. ' +
        'This is the constraint the whole architecture rests on.',
      from: { path: '^packages/core' },
      to: {
        /*
         * Matches BOTH forms this can take. Because pnpm gives core its own
         * node_modules, importing a package core does not declare leaves the
         * specifier unresolved — so matching only `node_modules/react` would
         * pass vacuously on exactly the mistake the rule exists to catch.
         * The first alternative catches the unresolved specifier, the second
         * catches the case where someone also adds it to core's package.json.
         */
        path:
          '^(react|react-dom|zustand|yjs|y-protocols|loro-crdt|@automerge/|tldraw|@tldraw/|@excalidraw/|pg|postgres|@supabase/|idb)($|/)' +
          '|node_modules/(react|react-dom|zustand|yjs|y-protocols|loro-crdt|@automerge|tldraw|@tldraw|@excalidraw|pg|postgres|@supabase|idb)',
      },
    },
    {
      name: 'yjs-lives-only-in-collab',
      severity: 'error',
      comment:
        'Yjs exists in exactly one package. ADR 0007 made patches OpenFrame\'s own format precisely ' +
        'so that a CRDT could be translated at one seam rather than threaded through the domain, and ' +
        'ADR 0013 is reversible only for as long as that holds. A `yjs` import anywhere else is the ' +
        'phase\'s last "done when" quietly failing.',
      from: { pathNot: '^packages/collab' },
      to: {
        /*
         * Both spellings, for the same reason as `core-is-pure`: pnpm gives
         * each package its own node_modules, so importing yjs from a package
         * that has not declared it leaves the specifier UNRESOLVED — and a rule
         * matching only `node_modules/yjs` would pass vacuously on exactly the
         * mistake it exists to catch.
         */
        path: '^(yjs|y-protocols|lib0)($|/)' + '|node_modules/(yjs|y-protocols|lib0)($|/)',
      },
    },
    {
      name: 'collab-does-not-depend-on-apps',
      severity: 'error',
      comment:
        'The collaboration adapter is consumed by the app, never the other way round. It also runs ' +
        'inside a Durable Object, where nothing from apps/web exists at all.',
      from: { path: '^packages/collab' },
      to: { path: '^apps' },
    },
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment:
        'An import that cannot be resolved is either a typo or a package a workspace has not declared. ' +
        'Under pnpm the latter is how a boundary violation first shows up.',
      from: {},
      to: {
        couldNotResolve: true,
        /*
         * `cloudflare:workers` is supplied by the Workers runtime, the way
         * `node:fs` is supplied by Node — there is no package to install and
         * nothing on disk to resolve to. It is exempted here and then confined
         * by `cloudflare-lives-only-in-rooms` below, so the exemption cannot
         * quietly become a way for the runtime to leak somewhere else.
         */
        pathNot: '^cloudflare:',
      },
    },
    {
      name: 'cloudflare-lives-only-in-rooms',
      severity: 'error',
      comment:
        'The Durable Object runtime exists in exactly one app. ADR 0013 is reversible — Hocuspocus is a ' +
        'week away rather than a rewrite — only because everything that DECIDES anything lives in ' +
        '@openframe/collab, which has never heard of Cloudflare. A `cloudflare:` import outside ' +
        'apps/rooms is that guarantee being given up.',
      from: { pathNot: '^apps/rooms' },
      to: { path: '^cloudflare:' },
    },
    {
      name: 'core-does-not-depend-on-apps',
      severity: 'error',
      comment: 'Dependencies point inward. An application may use the domain; never the reverse.',
      from: { path: '^packages/core' },
      to: { path: '^apps' },
    },
    {
      name: 'core-is-platform-neutral',
      severity: 'error',
      comment:
        'The domain must run in a browser, in Node and in a worker. Platform code belongs in an adapter.',
      from: { path: '^packages/core', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['core'] },
    },
    /*
     * LAYER ORDER inside apps/web, enforced rather than described.
     *
     *   ui ─┐
     *       ├─► interaction ──► scene ──► @openframe/core
     *   canvas ─┘
     *
     * `no-circular` only catches cycles between FILES, so it happily allowed
     * `interaction → canvas` alongside `canvas → interaction` — a mutual
     * dependency between layers that the documented direction forbids. These
     * rules make the direction real.
     */
    {
      name: 'scene-is-a-leaf',
      severity: 'error',
      comment:
        'scene/ is pure view geometry over core types. It must not reach React, state or chrome.',
      from: { path: '^apps/web/src/scene' },
      to: { path: '^apps/web/src/(canvas|interaction|ui|app|adapters|hooks)' },
    },
    {
      name: 'interaction-does-not-depend-on-canvas',
      severity: 'error',
      comment:
        'canvas/ reads interaction state to render, so interaction must not depend back on it. ' +
        'Shared view geometry belongs in scene/.',
      from: { path: '^apps/web/src/interaction' },
      to: { path: '^apps/web/src/(canvas|ui|app|views)' },
    },
    {
      name: 'views-are-a-leaf',
      severity: 'error',
      comment:
        'views/ is the React half of the object type system. It must not reach the renderer, ' +
        'interaction state or the composition root — everything it needs arrives as props.',
      from: { path: '^apps/web/src/views' },
      to: { path: '^apps/web/src/(canvas|interaction|ui|app|adapters|hooks|runtime)' },
    },
    {
      name: 'runtime-context-is-shared',
      severity: 'error',
      comment:
        'runtime/ describes the wired application so every layer can consume it without ' +
        'depending on the module that builds it.',
      from: { path: '^apps/web/src/runtime' },
      to: { path: '^apps/web/src/(canvas|interaction|ui|app|adapters|hooks|scene)' },
    },
    {
      name: 'ui-does-not-depend-on-canvas',
      severity: 'error',
      comment: 'Chrome talks to interaction state and commands, never to the renderer.',
      from: { path: '^apps/web/src/ui' },
      to: { path: '^apps/web/src/canvas' },
    },
    {
      name: 'ui-does-not-touch-persistence',
      severity: 'error',
      comment: 'UI components go through commands and hooks, never straight to a repository.',
      from: { path: '^apps/web/src/ui' },
      to: { path: '^apps/web/src/adapters' },
    },
    {
      name: 'canvas-does-not-touch-persistence',
      severity: 'error',
      comment: 'The renderer draws from the store. It does not know where boards are kept.',
      from: { path: '^apps/web/src/canvas' },
      to: { path: '^apps/web/src/adapters' },
    },
    {
      name: 'interaction-does-not-touch-persistence',
      severity: 'error',
      comment: 'Tools dispatch commands; persistence is attached at the composition root.',
      from: { path: '^apps/web/src/interaction' },
      to: { path: '^apps/web/src/adapters' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'An unreferenced module is usually a leftover.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)(eslint|vite|vitest|playwright)\\.config\\.(js|ts)$',
          // Listed rather than folded into the pattern above: a regex with a
          // nested optional group there is flagged as catastrophic, and
          // dependency-cruiser refuses to run at all rather than risk it.
          '(^|/)playwright\\.rooms\\.config\\.ts$',
          '^apps/web/src/(main\\.tsx|test-setup\\.ts)$',
          '^packages/core/src/testing\\.ts$',
          '^tools/',
          '^apps/web/src/ui/DevPanel\\.tsx$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '(\\.test\\.tsx?$|^apps/web/e2e(-rooms)?/|/dist/|/coverage/)' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'types'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
}
