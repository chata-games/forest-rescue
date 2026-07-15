import { defineConfig } from 'vitest/config';

// Vitest config for the engine-independent domain boundary.
// Domain tests run in Node (no DOM/Phaser) and import the compiled level JSON
// directly through Vite's JSON resolver.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
    reporters: 'default',
  },
});
