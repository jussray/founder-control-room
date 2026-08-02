import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/ai-company-adversarial.test.ts'],
  },
});
