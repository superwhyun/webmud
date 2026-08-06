import type { WebSocket } from 'ws';
import type { ClientMessage } from '@mud/shared';
import { verifyToken } from '../auth/jwt.js';
import { db } from '../db/client.js';
import { loadCharacter, toCharacterState } from './characterState.js';
import { cleanupCombatForSession } from './combat/CombatManager.js';
import { getEffectiveStats } from './combatStats.js';
import { dispatchCommand } from './commands/index.js';
import { broadcastRoomSnapshot, sendRoomSnapshot } from './roomSnapshot.js';
import { addSession, getSession, removeSession, type Session } from './sessionRegistry.js';
import { send } from './wsUtil.js';

function handleAuth(ws: WebSocket, token: string): void {
  const payload = verifyToken(token);
  if (!payload) {
    send(ws, { type: 'error', text: '인증에 실패했습니다.' });
    ws.close();
    return;
  }

  const characterRow = db
    .prepare('SELECT id, room_id, name FROM characters WHERE account_id = ?')
    .get(payload.accountId) as { id: number; room_id: number; name: string } | undefined;

  if (!characterRow) {
    send(ws, { type: 'error', text: '캐릭터가 없습니다. 먼저 캐릭터를 생성하세요.' });
    ws.close();
    return;
  }

  const session: Session = {
    ws,
    accountId: payload.accountId,
    characterId: characterRow.id,
    characterName: characterRow.name,
    roomId: characterRow.room_id,
  };
  addSession(session);

  const character = loadCharacter(characterRow.id);
  if (!character) return;

  send(ws, { type: 'text', text: `다시 오신 것을 환영합니다, ${character.name}님.` });
  send(ws, { type: 'state', character: toCharacterState(character, getEffectiveStats(character)) });
  sendRoomSnapshot({ session, send: (message) => send(ws, message) });
  broadcastRoomSnapshot(session.roomId);
}

function handleCommand(ws: WebSocket, text: string): void {
  const session = getSession(ws);
  if (!session) {
    send(ws, { type: 'error', text: '인증이 필요합니다.' });
    return;
  }
  dispatchCommand({ session, send: (message) => send(ws, message) }, text);
}

export function handleConnection(ws: WebSocket): void {
  send(ws, { type: 'text', text: '서버에 연결되었습니다. 인증을 진행하세요.' });

  ws.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', text: '잘못된 메시지 형식입니다.' });
      return;
    }

    if (message.type === 'auth') {
      handleAuth(ws, message.token);
    } else if (message.type === 'command') {
      handleCommand(ws, message.text);
    }
  });

  ws.on('close', () => {
    const session = getSession(ws);
    cleanupCombatForSession(ws);
    removeSession(ws);
    if (session) broadcastRoomSnapshot(session.roomId);
  });
}
