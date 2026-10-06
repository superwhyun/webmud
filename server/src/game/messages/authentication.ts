import type { WebSocket } from 'ws';
import { verifyToken } from '../../auth/jwt.js';
import { db } from '../../db/client.js';
import { loadCharacter, toCharacterState } from '../characterState.js';
import { sendActiveBuffs, sendSkillCooldowns } from '../combat/CombatManager.js';
import { getEffectiveStats } from '../combatStats.js';
import { sendEquipmentAndInventory } from '../commands/equipment.js';
import { sendSkills } from '../commands/skills.js';
import { assignJobToLegacyCharacter, isValidJob } from '../jobSelection.js';
import { broadcastRoomSnapshot, sendRoomSnapshot } from '../roomSnapshot.js';
import { addSession, getSession, type Session } from '../sessionRegistry.js';
import { send } from '../wsUtil.js';

interface PendingJobSelection {
  accountId: number;
  characterId: number;
  characterName: string;
  roomId: number;
}

const pendingJobSelections = new Map<WebSocket, PendingJobSelection>();

function enterWorld(ws: WebSocket, session: Session): void {
  addSession(session);

  const character = loadCharacter(session.characterId);
  if (!character) return;

  send(ws, { type: 'text', text: `다시 오신 것을 환영합니다, ${character.name}님.` });
  send(ws, { type: 'state', character: toCharacterState(character, getEffectiveStats(character)) });
  sendRoomSnapshot({ session, send: (message) => send(ws, message) });
  sendEquipmentAndInventory({ session, send: (message) => send(ws, message) });
  sendSkills({ session, send: (message) => send(ws, message) });
  sendSkillCooldowns({ session, send: (message) => send(ws, message) }, session.characterId);
  sendActiveBuffs({ session, send: (message) => send(ws, message) }, session.characterId);
  broadcastRoomSnapshot(session.roomId);
}

export function handleAuth(ws: WebSocket, token: string): void {
  if (getSession(ws)) {
    send(ws, { type: 'error', text: '이미 인증된 연결입니다.' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    send(ws, { type: 'error', text: '인증에 실패했습니다.' });
    ws.close();
    return;
  }

  const characterRow = db
    .prepare('SELECT id, room_id, name, job FROM characters WHERE account_id = ?')
    .get(payload.accountId) as { id: number; room_id: number; name: string; job: string | null } | undefined;

  if (!characterRow) {
    send(ws, { type: 'error', text: '캐릭터가 없습니다. 먼저 캐릭터를 생성하세요.' });
    ws.close();
    return;
  }

  if (!characterRow.job) {
    pendingJobSelections.set(ws, {
      accountId: payload.accountId,
      characterId: characterRow.id,
      characterName: characterRow.name,
      roomId: characterRow.room_id,
    });
    send(ws, { type: 'needsJob' });
    return;
  }

  const session: Session = {
    ws,
    accountId: payload.accountId,
    characterId: characterRow.id,
    characterName: characterRow.name,
    roomId: characterRow.room_id,
  };
  enterWorld(ws, session);
}

export function handleChooseJob(ws: WebSocket, job: string): void {
  const pending = pendingJobSelections.get(ws);
  if (!pending) {
    send(ws, { type: 'error', text: '직업 선택이 필요한 상태가 아닙니다.' });
    return;
  }
  if (!isValidJob(job)) {
    send(ws, { type: 'error', text: '올바르지 않은 직업입니다.' });
    return;
  }

  assignJobToLegacyCharacter(pending.characterId, job);
  pendingJobSelections.delete(ws);

  const session: Session = {
    ws,
    accountId: pending.accountId,
    characterId: pending.characterId,
    characterName: pending.characterName,
    roomId: pending.roomId,
  };
  enterWorld(ws, session);
}

export function isJobSelectionPending(ws: WebSocket): boolean {
  return pendingJobSelections.has(ws);
}

export function clearPendingJobSelection(ws: WebSocket): void {
  pendingJobSelections.delete(ws);
}
