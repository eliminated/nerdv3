/// <reference types="vite/client" />

import type { NerdyApi } from '../preload/api.js';

// `declare global` rather than a bare declaration: this file has imports, so it
// is a module, and an unqualified `interface Window` here would augment nothing.
//
// There is deliberately no `declare module '*.vue'` shim. vue-tsc understands
// SFCs natively and type-checks INSIDE them; a wildcard shim would silence that
// by typing every component as `any` — which is exactly the checking V3-C's
// seven views need most.
declare global {
  interface Window {
    /** The allowlisted preload surface. See src/preload/index.ts. */
    readonly nerdy: NerdyApi;
  }
}
