import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Type-aware linting is the reason this project is on TypeScript 6 rather than
 * TypeScript 7 — see docs/adr/0010-typescript-6-until-ts71.md. The rules that
 * need type information (floating promises, unsafe `any`, impossible
 * comparisons) are exactly the ones that catch bugs in a command layer with
 * async persistence.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'tools/bench/fixtures/**',
      // Wrangler's temporary bundles. Generated on every `wrangler dev`, in no
      // tsconfig project, and not ours.
      '**/.wrangler/**',
      // Vendored third-party tooling (the impeccable design skill). Not ours to
      // lint, and its browser bundles are not in any tsconfig project.
      '.claude/**',
      '.impeccable/**',
      '**/.impeccable/**',
    ],
  },

  js.configs.recommended,
  /*
   * `recommendedTypeChecked`, not `strictTypeChecked`.
   *
   * The rules worth having here are the ones that need type information to find
   * real bugs: floating promises, misused promises, unsafe `any`, impossible
   * comparisons, bad `+` operands. `strict` adds stylistic rules that fight
   * idiomatic React and Zustand (every `onClick={() => setTool(x)}` becomes an
   * error), and a lint config people routinely disable is worse than one they
   * trust.
   */
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  /*
   * ARCHITECTURAL BOUNDARIES.
   *
   * `dependency-cruiser` enforces the same rules across the whole graph,
   * including transitive reach; these give the same feedback in the editor,
   * as you type, which is where a boundary violation is cheapest to fix.
   */
  {
    files: ['packages/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'The domain must not depend on React. Put view code in apps/web.',
            },
            { name: 'react-dom', message: 'The domain must not depend on React DOM.' },
            {
              name: 'zustand',
              message: 'The domain owns its own state; UI stores belong in apps/web.',
            },
            {
              name: 'yjs',
              message: 'CRDT types must not leak into the domain. Use the collaboration adapter.',
            },
          ],
          patterns: [
            { group: ['**/apps/**'], message: 'core must never depend on an application.' },
            {
              group: ['node:*'],
              message: 'The domain must stay platform-neutral. Put platform code in an adapter.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests may use Node built-ins; they run in Node by definition.
    files: ['packages/core/**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['apps/web/src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/adapters/**'],
              message: 'UI must not reach persistence directly. Go through commands and hooks.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      /*
       * Zustand selectors return store actions by design
       * (`useStore((s) => s.setTool)`), which this rule reads as an unbound
       * method. The store holds no `this`, so the warning cannot apply.
       */
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  {
    // Benchmark probes report measurements to stdout; that is their output.
    files: ['**/*.bench.spec.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'apps/web/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['**/*.config.{js,ts}', 'tools/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  // Build and tool configuration sits outside the TypeScript projects, so
  // type-aware rules have nothing to work from.
  {
    files: ['**/*.config.{js,ts}', 'eslint.config.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off', '@typescript-eslint/no-require-imports': 'off' },
  },
)
