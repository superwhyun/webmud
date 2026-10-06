import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    proxy: {
      '/api': process.env.MUD_SERVER_URL ?? 'http://localhost:3001',
      '/ws': {
        target: (process.env.MUD_SERVER_URL ?? 'http://localhost:3001').replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
