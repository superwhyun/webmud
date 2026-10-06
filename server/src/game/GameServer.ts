import type { WebSocket } from 'ws';
import { cleanupCombatForSession } from './combat/CombatManager.js';
import { handleAuth, handleChooseJob, clearPendingJobSelection, isJobSelectionPending } from './messages/authentication.js';
import { clientMessageSchema } from './messages/schema.js';
import { dispatchSessionMessage } from './messages/session.js';
import { stopResting } from './rest.js';
import { broadcastRoomSnapshot } from './roomSnapshot.js';
import { getSession, removeSession } from './sessionRegistry.js';
import { send } from './wsUtil.js';

export function handleConnection(ws: WebSocket): void {
  send(ws, { type: 'text', text: '서버에 연결되었습니다. 인증을 진행하세요.' });

  ws.on('message', (raw) => {
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', text: '잘못된 메시지 형식입니다.' });
      return;
    }
    const parsed = clientMessageSchema.safeParse(payload);
    if (!parsed.success) {
      send(ws, { type: 'error', text: '잘못된 메시지 형식입니다.' });
      return;
    }
    const message = parsed.data;
    if (message.type === 'auth') {
      handleAuth(ws, message.token);
    } else if (message.type === 'chooseJob') {
      handleChooseJob(ws, message.job);
    } else {
      const session = getSession(ws);
      if (!session) {
        send(ws, {
          type: 'error',
          text: message.type === 'command' && isJobSelectionPending(ws) ? '먼저 직업을 선택하세요.' : '인증이 필요합니다.',
        });
        return;
      }
      dispatchSessionMessage({ session, send: (response) => send(ws, response) }, message);
    }
  });

  ws.on('close', () => {
    const session = getSession(ws);
    clearPendingJobSelection(ws);
    cleanupCombatForSession(ws);
    stopResting(ws);
    removeSession(ws);
    if (session) broadcastRoomSnapshot(session.roomId);
  });
}
