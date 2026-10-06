import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { DB_PATH: ':memory:', DEFAULT_ADMIN_PASSWORD: 'test-password' },
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
