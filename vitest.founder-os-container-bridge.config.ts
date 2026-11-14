import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/founder-os-container-bridge.test.ts'],
  },
});
