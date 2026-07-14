import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['prototypes/phaser-mobile-proof/tests/**/*.test.ts'],
    environment: 'node',
  },
});
