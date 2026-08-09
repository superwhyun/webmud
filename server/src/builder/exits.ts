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
  label: z.string().min(1, '연결점 이름을 입력하세요.').max(30, '연결점 이름은 30자 이하여야 합니다.'),
  targetRoomId: z.number().int(),
  returnLabel: z.string().max(30, '왕복 연결점 이름은 30자 이하여야 합니다.').optional(),
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
 */
builderRouter.post('/exits', (req, res) => {
  const parsed = exitCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, label, targetRoomId, returnLabel } = parsed.data;

  if (CARDINAL_SET.has(label) || (returnLabel && CARDINAL_SET.has(returnLabel))) {
    res.status(400).json({ error: '연결점 이름으로 north/south/east/west는 쓸 수 없습니다.' });
    return;
  }

  const fromRoom = getRoom(roomId);
  const toRoom = getRoom(targetRoomId);
  if (!fromRoom || !toRoom) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }
  if (fromRoom.exits[label]) {
    res.status(409).json({ error: '이미 같은 이름의 연결점이 있습니다.' });
    return;
  }
  if (returnLabel && toRoom.exits[returnLabel]) {
    res.status(409).json({ error: '대상 방에 이미 같은 이름의 연결점이 있습니다.' });
    return;
  }

  db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id, blocked) VALUES (?, ?, ?, 0)').run(
    roomId,
    label,
    targetRoomId,
  );
  addExit(roomId, label, targetRoomId, false);

  if (returnLabel) {
    db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id, blocked) VALUES (?, ?, ?, 0)').run(
      targetRoomId,
      returnLabel,
      roomId,
    );
    addExit(targetRoomId, returnLabel, roomId, false);
  }

  broadcastRoomSnapshot(roomId);
  if (returnLabel) broadcastRoomSnapshot(targetRoomId);

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
  if (!room?.exits[direction]) {
    res.status(404).json({ error: '연결점을 찾을 수 없습니다.' });
    return;
  }

  db.prepare('DELETE FROM room_exits WHERE room_id = ? AND direction = ?').run(roomId, direction);
  removeExit(roomId, direction);
  broadcastRoomSnapshot(roomId);

  res.status(204).send();
});
