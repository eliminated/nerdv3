import { createApp } from 'vue';

import App from './App.vue';

// ESLint's TypeScript parser cannot resolve a `.vue` single-file component, so
// the import lands as `error`-typed and every type-aware rule downstream reports
// it as unsafe. The type checking is real and does happen — `npm run typecheck`
// runs vue-tsc, which parses SFCs natively and checks INSIDE them.
//
// The alternative, a global `declare module '*.vue'` shim, would silence this by
// typing every component as `any` — which is worse, because it would also
// silence vue-tsc for the seven views V3-C is about to add.
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
createApp(App).mount('#app');
