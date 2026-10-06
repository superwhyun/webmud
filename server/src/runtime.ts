import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createApplication } from './app.js';
import { handleConnection } from './game/GameServer.js';
import { startVillageTick } from './game/village/villageTick.js';
import { startWorldTick } from './game/worldTick.js';

/** The executable owns when to start and stop the runtime; app imports never start it. */
export function createRuntime() {
  const httpServer = createServer(createApplication());
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', handleConnection);
  const stopWorldTick = startWorldTick();
  const stopVillageTick = startVillageTick();
  let closing: Promise<void> | undefined;

  function close(): Promise<void> {
    if (closing) return closing;
    stopWorldTick();
    stopVillageTick();
    for (const client of wss.clients) client.terminate();
    httpServer.closeAllConnections();
    closing = Promise.all([
      new Promise<void>((resolve, reject) => wss.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => httpServer.close((error) => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      })),
    ]).then(() => undefined);
    return closing;
  }

  return { httpServer, wss, close };
}
