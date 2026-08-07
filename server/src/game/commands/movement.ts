import { DIRECTION_LABELS, OPPOSITE_DIRECTION } from '@mud/shared';
import { db } from '../../db/client.js';
import { loadCharacterState } from '../characterState.js';
import { isInCombat } from '../combat/CombatManager.js';
import { broadcastRoomSnapshot } from '../roomSnapshot.js';
import { broadcastToRoom } from '../sessionRegistry.js';
import { getRoom } from '../World.js';
import type { CommandContext } from './context.js';

const DIRECTION_ALIASES: Record<string, string> = {
  n: 'north',
  north: 'north',
  s: 'south',
  south: 'south',
  e: 'east',
  east: 'east',
  w: 'west',
  west: 'west',
  u: 'up',
  up: 'up',
  d: 'down',
  down: 'down',
};

export function resolveDirection(input: string): string | undefined {
  return DIRECTION_ALIASES[input.toLowerCase()];
}

export function handleMove(ctx: CommandContext, direction: string): void {
  if (isInCombat(ctx.session.ws)) {
    ctx.send({ type: 'text', text: '전투 중에는 이동할 수 없습니다. flee로 먼저 도망치세요.' });
    return;
  }

  const room = getRoom(ctx.session.roomId);
  const targetRoomId = room?.exits[direction];

  if (!room || targetRoomId === undefined || !getRoom(targetRoomId)) {
    ctx.send({ type: 'text', text: '그 방향으로는 갈 수 없습니다.' });
    return;
  }

  const oldRoomId = room.id;

  broadcastToRoom(
    oldRoomId,
    { type: 'text', text: `${ctx.session.characterName}님이 ${DIRECTION_LABELS[direction]}(으)로 떠났습니다.` },
    ctx.session.ws,
  );

  ctx.session.roomId = targetRoomId;
  db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(targetRoomId, ctx.session.characterId);

  const arrivalDirection = OPPOSITE_DIRECTION[direction];
  broadcastToRoom(
    targetRoomId,
    { type: 'text', text: `${ctx.session.characterName}님이 ${DIRECTION_LABELS[arrivalDirection]}에서 들어왔습니다.` },
    ctx.session.ws,
  );

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });

  broadcastRoomSnapshot(oldRoomId);
  broadcastRoomSnapshot(targetRoomId);
}
