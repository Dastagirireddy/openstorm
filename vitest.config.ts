import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    deps: {
      optimizer: {
        ssr: {
          enabled: false,
        },
      },
    },
  },
});
