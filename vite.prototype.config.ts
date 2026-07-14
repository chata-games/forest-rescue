import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const prototypeRoot = fileURLToPath(new URL('./prototypes/phaser-mobile-proof', import.meta.url));

export default defineConfig({
  root: prototypeRoot,
  base: './',
  publicDir: false,
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/phaser-mobile-proof', import.meta.url)),
    emptyOutDir: true,
  },
});
