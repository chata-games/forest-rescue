import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const prototypeRoot = fileURLToPath(
  new URL('./prototypes/battlefield-composition', import.meta.url),
);

export default defineConfig({
  root: prototypeRoot,
  base: './',
  publicDir: false,
  server: {
    host: '0.0.0.0',
    port: 4174,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('.', import.meta.url))],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/battlefield-composition', import.meta.url)),
    emptyOutDir: true,
  },
});
