import { DIRECTION_LABELS, OPPOSITE_DIRECTION } from '@mud/shared';
import { db } from '../../db/client.js';
import { loadCharacterState } from '../characterState.js';
import { isInCombat, triggerAggro } from '../combat/CombatManager.js';
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
  const exit = room?.exits[direction];

  if (!room || !exit || !getRoom(exit.targetRoomId)) {
    ctx.send({ type: 'text', text: '그 방향으로는 갈 수 없습니다.' });
    return;
  }

  if (exit.blocked) {
    ctx.send({ type: 'text', text: '그 방향은 막혀 있습니다.' });
    return;
  }

  const targetRoomId = exit.targetRoomId;

  const oldRoomId = room.id;

  const departureLabel = DIRECTION_LABELS[direction] ?? direction;
  broadcastToRoom(
    oldRoomId,
    { type: 'text', text: `${ctx.session.characterName}님이 ${departureLabel}(으)로 떠났습니다.` },
    ctx.session.ws,
  );

  ctx.session.roomId = targetRoomId;
  db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(targetRoomId, ctx.session.characterId);

  const arrivalDirection = OPPOSITE_DIRECTION[direction];
  const arrivalText = arrivalDirection
    ? `${DIRECTION_LABELS[arrivalDirection]}에서 들어왔습니다.`
    : '연결점을 통해 들어왔습니다.';
  broadcastToRoom(
    targetRoomId,
    { type: 'text', text: `${ctx.session.characterName}님이 ${arrivalText}` },
    ctx.session.ws,
  );

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });

  broadcastRoomSnapshot(oldRoomId);
  broadcastRoomSnapshot(targetRoomId);

  triggerAggro(ctx);
}

/** Moves through a named, non-cardinal exit (a builder-created portal) by exact label match. */
export function handleEnter(ctx: CommandContext, label: string): void {
  const trimmed = label.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '이동할 곳의 이름을 입력하세요. 사용법: enter <이름>' });
    return;
  }

  const room = getRoom(ctx.session.roomId);
  const matchedDirection = room && Object.keys(room.exits).find((direction) => direction === trimmed);
  if (!matchedDirection) {
    ctx.send({ type: 'text', text: '그런 이름의 연결점이 없습니다.' });
    return;
  }

  handleMove(ctx, matchedDirection);
}
