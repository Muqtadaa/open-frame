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
      name: 'no-unresolvable',
      severity: 'error',
      comment:
        'An import that cannot be resolved is either a typo or a package a workspace has not declared. ' +
        'Under pnpm the latter is how a boundary violation first shows up.',
      from: {},
      to: { couldNotResolve: true },
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
    exclude: { path: '(\\.test\\.tsx?$|^apps/web/e2e/|/dist/|/coverage/)' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'types'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
}
