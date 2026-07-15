import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Production build config for the Phaser stack.
// - root is app/ so the build emits a clean dist/app/{index.html,assets/}.
// - The app imports the shared CompiledLevel JSON from ../levels; that path is
//   outside root, so fs.allow widens to the repo root for the dev server (the
//   build bundles it regardless).
// - base './' emits relative asset URLs so the build deploys to GitHub Pages
//   at any sub-path (project pages live under /<repo>/).
const appRoot = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: appRoot,
  base: './',
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('../dist/app', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
});
