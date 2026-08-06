import { createServer } from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { authRouter } from './auth/routes.js';
import { handleConnection } from './game/GameServer.js';
import { startWorldTick } from './game/worldTick.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', authRouter);

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
wss.on('connection', handleConnection);
startWorldTick();

httpServer.listen(PORT, () => {
  console.log(`MUD server listening on http://localhost:${PORT}`);
});
