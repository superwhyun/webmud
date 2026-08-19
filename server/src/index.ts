import { createServer } from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { adminRouter } from './admin/routes.js';
import { authRouter } from './auth/routes.js';
import { builderRouter } from './builder/routes.js';
import { handleConnection } from './game/GameServer.js';
import { startVillageTick } from './game/village/villageTick.js';
import { startWorldTick } from './game/worldTick.js';
import { suggestionsRouter } from './suggestions/routes.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
// 맵 export/import는 존/방/스폰 전체를 한 번에 주고받아서 기본 100kb 제한을 넘길 수 있다.
// 다른 라우터(로그인 등)는 굳이 큰 페이로드를 받을 이유가 없으니 그쪽은 기본값을 그대로 둔다.
app.use('/api/builder', express.json({ limit: '10mb' }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', authRouter);
app.use('/api/builder', builderRouter);
app.use('/api/admin', adminRouter);
app.use('/api/suggestions', suggestionsRouter);

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
wss.on('connection', handleConnection);
startWorldTick();
startVillageTick();

httpServer.listen(PORT, () => {
  console.log(`MUD server listening on http://localhost:${PORT}`);
});

// nested npm/concurrently/tsx-watch 프로세스 체인 아래에서는 Ctrl-C의 SIGINT가
// 열려있는 WS 연결과 함께 온전히 전파되지 않을 때가 있어, tsx가 5초 뒤 강제
// 종료하는 상황이 생긴다. 신호를 받는 즉시 소켓을 정리하고 바로 exit해서
// 그 타임아웃에 걸리지 않도록 한다.
function shutdown(signal: NodeJS.Signals): void {
  console.log(`\n${signal} received, shutting down...`);
  for (const client of wss.clients) {
    client.terminate();
  }
  wss.close();
  httpServer.closeAllConnections();
  httpServer.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
