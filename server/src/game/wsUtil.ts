import type { WebSocket } from 'ws';
import type { ServerMessage } from '@mud/shared';

export function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}
