import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
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
    // eslint.config.js and vitest.config.ts are not in any package tsconfig.
    files: ['**/*.config.{js,ts}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
