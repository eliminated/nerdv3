import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `out/` is electron-vite's build output — bundled JS that is not in any
  // tsconfig, so type-aware rules crash on it rather than merely reporting.
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/out/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // ESLint 9's default discovery for `eslint .` is js/mjs/cjs ONLY, so
    // without this the whole TypeScript tree would lint silently clean.
    // Probed: removing this line makes a deliberate `any` in core go unreported.
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Every async-ordering bug this project has found (spec
      // 2026-07-26-phase-2-signal-design.md §4.2) was an un-awaited or
      // mis-ordered promise. This rule is the cheap half of the fix.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    // The repositories implement Promise-returning ports (V3 spec §5) over a
    // SYNCHRONOUS sqlite driver, so their bodies legitimately never await.
    // `async` is load-bearing anyway: without it a validation failure or a
    // constraint violation would throw synchronously out of a method declared
    // to return a Promise, and `Promise.all([...])` or a bare `.catch()` would
    // then get an uncaught exception instead of a rejection.
    files: ['packages/*/src/data/*.ts', 'packages/*/src/db/local-user.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
  {
    // Files outside every package tsconfig, so type-aware rules cannot run and
    // would CRASH rather than report: the config files themselves, and the
    // CommonJS Electron guard under scripts/.
    files: ['**/*.config.{js,ts}', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // The Electron sqlite guard is deliberately CommonJS: it is loaded by
    // Electron's main process directly, with no bundler and no TypeScript, so
    // that verifying the runtime does not depend on the build working.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
