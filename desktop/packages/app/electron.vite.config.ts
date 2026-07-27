import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  main: {
    // `@nerdyapp/core` must be BUNDLED, not externalized: it is a workspace
    // package whose `exports` points at raw TypeScript with no build step, so
    // an externalized import would hand Node a .ts file at runtime.
    plugins: [externalizeDepsPlugin({ exclude: ['@nerdyapp/core'] })],
    build: {
      // Every outDir is pinned relative to THIS package. `renderer.root` points
      // at src/renderer, and vite resolves outDir against root — so without
      // this the renderer built into desktop/out/ while the main process
      // looked for it beside its own bundle, and the window loaded nothing.
      outDir: r('out/main'),
      rollupOptions: {
        // Two genuinely different executables (V3 spec §5), selected at BUILD
        // time by which bindings module the entry imports — never by an env var
        // read at runtime, which would put the fixture code inside the product
        // binary (plan P31B, decision B4).
        input: {
          index: r('src/entry-product.ts'),
          'index-test': r('src/entry-test.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: r('out/preload'),
      rollupOptions: {
        input: { index: r('src/preload/index.ts') },
        // A SANDBOXED preload must be CommonJS — Electron loads it in a context
        // with no ESM loader, so an `import` statement fails with "Cannot use
        // import statement outside a module" and `window.nerdy` is silently
        // undefined. The package is `"type": "module"`, so the extension has to
        // be .cjs for Node to read it as CJS.
        //
        // The alternative fix is `sandbox: false`, which is not a fix: the
        // sandbox is what keeps a compromised renderer away from the database.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: r('src/renderer'),
    plugins: [vue()],
    build: {
      outDir: r('out/renderer'),
      rollupOptions: { input: { index: r('src/renderer/index.html') } },
    },
  },
});
