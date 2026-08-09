import { db } from '../db/client.js';
import { loadCharacterState } from '../game/characterState.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { broadcastToRoom, getAllSessions, type Session } from '../game/sessionRegistry.js';
import { getRoom } from '../game/World.js';
import { send } from '../game/wsUtil.js';

export interface ForceMoveResult {
  ok: boolean;
  error?: string;
}

export function forceMoveSession(session: Session, targetRoomId: number): ForceMoveResult {
  const targetRoom = getRoom(targetRoomId);
  if (!targetRoom) {
    return { ok: false, error: '대상 방을 찾을 수 없습니다.' };
  }

  const oldRoomId = session.roomId;
  if (oldRoomId === targetRoomId) {
    return { ok: false, error: '이미 그 방에 있습니다.' };
  }

  broadcastToRoom(
    oldRoomId,
    { type: 'text', text: `${session.characterName}님이 관리자에 의해 이동되었습니다.` },
    session.ws,
  );

  session.roomId = targetRoomId;
  db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(targetRoomId, session.characterId);

  broadcastToRoom(targetRoomId, { type: 'text', text: `${session.characterName}님이 나타났습니다.` }, session.ws);

  send(session.ws, { type: 'text', text: `관리자에 의해 ${targetRoom.name}(으)로 이동되었습니다.` });

  const state = loadCharacterState(session.characterId);
  if (state) send(session.ws, { type: 'state', character: state });

  broadcastRoomSnapshot(oldRoomId);
  broadcastRoomSnapshot(targetRoomId);

  return { ok: true };
}

export interface GrantGoldResult {
  ok: boolean;
  error?: string;
  gold?: number;
}

export function grantGold(accountId: number, amount: number): GrantGoldResult {
  const character = db.prepare('SELECT id FROM characters WHERE account_id = ?').get(accountId) as
    | { id: number }
    | undefined;
  if (!character) {
    return { ok: false, error: '이 계정에는 캐릭터가 없습니다.' };
  }

  db.prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(amount, character.id);
  const row = db.prepare('SELECT gold FROM characters WHERE id = ?').get(character.id) as { gold: number };

  const session = getAllSessions().find((s) => s.accountId === accountId);
  if (session) {
    send(session.ws, { type: 'text', text: `관리자로부터 ${amount} gold를 지급받았습니다.` });
    const state = loadCharacterState(character.id);
    if (state) send(session.ws, { type: 'state', character: state });
  }

  return { ok: true, gold: row.gold };
}

export function kickSession(session: Session, reason?: string): void {
  send(session.ws, {
    type: 'error',
    text: reason ? `서버에서 추방되었습니다: ${reason}` : '서버에서 추방되었습니다.',
  });
  session.ws.close();
}
