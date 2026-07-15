import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
const root = fileURLToPath(new URL('./prototypes/battle-shell', import.meta.url));
export default defineConfig({ root, base: './', publicDir: false, server: { host: '0.0.0.0', port: 4174, strictPort: true }, build: { outDir: fileURLToPath(new URL('./dist/battle-shell', import.meta.url)), emptyOutDir: true } });
