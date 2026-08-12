import type { WebSocket } from 'ws';
import type { ClientMessage } from '@mud/shared';
import { verifyToken } from '../auth/jwt.js';
import { db } from '../db/client.js';
import { loadCharacter, toCharacterState } from './characterState.js';
import { cleanupCombatForSession, sendSkillCooldowns } from './combat/CombatManager.js';
import { getEffectiveStats } from './combatStats.js';
import { dispatchCommand } from './commands/index.js';
import { handleEquipItemMessage, handleUnequipItemMessage, sendEquipmentAndInventory } from './commands/equipment.js';
import { handleDropItemMessage } from './commands/items.js';
import { sendSkills } from './commands/skills.js';
import { assignJobToLegacyCharacter, isValidJob } from './jobSelection.js';
import { stopResting } from './rest.js';
import { broadcastRoomSnapshot, sendRoomSnapshot } from './roomSnapshot.js';
import { addSession, getSession, removeSession, type Session } from './sessionRegistry.js';
import { send } from './wsUtil.js';

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
  broadcastRoomSnapshot(session.roomId);
}

function handleAuth(ws: WebSocket, token: string): void {
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

function handleChooseJob(ws: WebSocket, job: string): void {
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

function handleCommand(ws: WebSocket, text: string): void {
  const session = getSession(ws);
  if (!session) {
    send(ws, {
      type: 'error',
      text: pendingJobSelections.has(ws) ? '먼저 직업을 선택하세요.' : '인증이 필요합니다.',
    });
    return;
  }
  dispatchCommand({ session, send: (message) => send(ws, message) }, text);
}

function requireSession(ws: WebSocket): ReturnType<typeof getSession> {
  const session = getSession(ws);
  if (!session) send(ws, { type: 'error', text: '인증이 필요합니다.' });
  return session;
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
    } else if (message.type === 'equipItem') {
      const session = requireSession(ws);
      if (session) handleEquipItemMessage({ session, send: (m) => send(ws, m) }, message.inventoryId);
    } else if (message.type === 'unequipItem') {
      const session = requireSession(ws);
      if (session) handleUnequipItemMessage({ session, send: (m) => send(ws, m) }, message.slot);
    } else if (message.type === 'dropItem') {
      const session = requireSession(ws);
      if (session) handleDropItemMessage({ session, send: (m) => send(ws, m) }, message.inventoryId);
    } else if (message.type === 'chooseJob') {
      handleChooseJob(ws, message.job);
    }
  });

  ws.on('close', () => {
    const session = getSession(ws);
    pendingJobSelections.delete(ws);
    cleanupCombatForSession(ws);
    stopResting(ws);
    removeSession(ws);
    if (session) broadcastRoomSnapshot(session.roomId);
  });
}
