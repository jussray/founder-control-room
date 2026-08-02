import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/ai-company-adversarial.test.ts',
      'test/ai-company-sandboxes.test.ts',
      'test/ai-company-sandbox-inputs.test.ts',
      'test/ai-company-sandbox-rejection.test.ts',
    ],
  },
});
