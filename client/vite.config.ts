import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  test: {
    // client 워크스페이스에는 아직 테스트 파일이 없다 — 없다고 실패시키지 않는다.
    passWithNoTests: true,
  },
});
