import { z } from 'zod';
import { db } from '../db/client.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { addExit, getRoom, removeExit, setExitBlocked } from '../game/World.js';
import { builderRouter } from './router.js';

const CARDINAL_DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
const CARDINAL_SET = new Set<string>(CARDINAL_DIRECTIONS);

const exitBlockSchema = z.object({
  roomId: z.number().int(),
  direction: z.enum(CARDINAL_DIRECTIONS),
  blocked: z.boolean(),
});

const exitCreateSchema = z.object({
  roomId: z.number().int(),
  targetRoomId: z.number().int(),
});

builderRouter.patch('/exits/block', (req, res) => {
  const parsed = exitBlockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, direction, blocked } = parsed.data;
  const room = getRoom(roomId);
  if (!room?.exits[direction]) {
    res.status(404).json({ error: '출구를 찾을 수 없습니다.' });
    return;
  }

  db.prepare('UPDATE room_exits SET blocked = ? WHERE room_id = ? AND direction = ?').run(
    blocked ? 1 : 0,
    roomId,
    direction,
  );
  setExitBlocked(roomId, direction, blocked);
  broadcastRoomSnapshot(roomId);

  res.json({ roomId, direction, blocked });
});

/**
 * Portal-style connectors between rooms (usually across zones). Reuses room_exits with a custom,
 * non-cardinal `direction` value as the label — exitReconciler only ever touches north/south/east/west
 * rows, so these are completely safe from grid auto-reconciliation, and handleMove() already resolves
 * any direction string generically, so no runtime movement changes are needed.
 *
 * Portals are always bidirectional and auto-named after the room on the other end (e.g. "대장간 포털"),
 * so there is no separate label/returnLabel input — one-way portals aren't supported.
 */
builderRouter.post('/exits', (req, res) => {
  const parsed = exitCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, targetRoomId } = parsed.data;

  const fromRoom = getRoom(roomId);
  const toRoom = getRoom(targetRoomId);
  if (!fromRoom || !toRoom) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }

  const label = `${toRoom.name} 포털`;
  const returnLabel = `${fromRoom.name} 포털`;

  if (fromRoom.exits[label]) {
    res.status(409).json({ error: '이미 같은 대상으로 가는 연결점이 있습니다.' });
    return;
  }
  if (toRoom.exits[returnLabel]) {
    res.status(409).json({ error: '대상 방에 이미 같은 이름의 연결점이 있습니다.' });
    return;
  }

  db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id, blocked) VALUES (?, ?, ?, 0)').run(
    roomId,
    label,
    targetRoomId,
  );
  addExit(roomId, label, targetRoomId, false);

  db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id, blocked) VALUES (?, ?, ?, 0)').run(
    targetRoomId,
    returnLabel,
    roomId,
  );
  addExit(targetRoomId, returnLabel, roomId, false);

  broadcastRoomSnapshot(roomId);
  broadcastRoomSnapshot(targetRoomId);

  res.status(201).json({ ok: true });
});

builderRouter.delete('/exits/:roomId/:direction', (req, res) => {
  const roomId = Number(req.params.roomId);
  const direction = decodeURIComponent(req.params.direction);

  if (CARDINAL_SET.has(direction)) {
    res.status(400).json({ error: '방향 출구는 방을 드래그하거나 화살표를 클릭해 관리하세요.' });
    return;
  }

  const room = getRoom(roomId);
  const exit = room?.exits[direction];
  if (!room || !exit) {
    res.status(404).json({ error: '연결점을 찾을 수 없습니다.' });
    return;
  }

  db.prepare('DELETE FROM room_exits WHERE room_id = ? AND direction = ?').run(roomId, direction);
  removeExit(roomId, direction);
  broadcastRoomSnapshot(roomId);

  // 포털은 항상 양방향이므로, 반대편에서 이 방으로 돌아오는 짝도 함께 지운다.
  const targetRoom = getRoom(exit.targetRoomId);
  if (targetRoom) {
    for (const [returnDirection, returnExit] of Object.entries(targetRoom.exits)) {
      if (CARDINAL_SET.has(returnDirection) || returnExit.targetRoomId !== roomId) continue;
      db.prepare('DELETE FROM room_exits WHERE room_id = ? AND direction = ?').run(exit.targetRoomId, returnDirection);
      removeExit(exit.targetRoomId, returnDirection);
      broadcastRoomSnapshot(exit.targetRoomId);
    }
  }

  res.status(204).send();
});
