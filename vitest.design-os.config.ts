import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: true,
    environment: 'node',
    include: [
      'src/design-os/commands.test.ts',
      'src/design-os/registry.test.ts',
      'src/http/routes/designOs.test.ts',
    ],
  },
});
