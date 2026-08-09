import { z } from 'zod';
import { db } from '../db/client.js';
import { removeExit, unregisterRoom } from '../game/World.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { builderRouter } from './router.js';
import { canDeleteRoom } from './roomGuard.js';

const zoneCreateSchema = z.object({
  name: z.string().min(1, '존 이름을 입력하세요.').max(30, '존 이름은 30자 이하여야 합니다.'),
  description: z.string().max(200, '설명은 200자 이하여야 합니다.').optional().default(''),
});

builderRouter.get('/zones', (_req, res) => {
  const zones = db.prepare('SELECT id, name, description FROM zones ORDER BY id').all();
  res.json({ zones });
});

builderRouter.post('/zones', (req, res) => {
  const parsed = zoneCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { name, description } = parsed.data;
  if (db.prepare('SELECT 1 FROM zones WHERE name = ?').get(name)) {
    res.status(409).json({ error: '이미 사용 중인 존 이름입니다.' });
    return;
  }

  const info = db.prepare('INSERT INTO zones (name, description) VALUES (?, ?)').run(name, description);
  res.status(201).json({ zone: { id: Number(info.lastInsertRowid), name, description } });
});

/** Deletes a zone and every room/exit inside it. Refuses if any room can't be safely removed (occupied or a village anchor). */
builderRouter.delete('/zones/:id', (req, res) => {
  const zoneId = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM zones WHERE id = ?').get(zoneId)) {
    res.status(404).json({ error: '존을 찾을 수 없습니다.' });
    return;
  }

  const roomIds = (db.prepare('SELECT id FROM rooms WHERE zone_id = ?').all(zoneId) as { id: number }[]).map(
    (row) => row.id,
  );

  for (const roomId of roomIds) {
    const check = canDeleteRoom(roomId);
    if (!check.allowed) {
      res.status(409).json({ error: `이 존을 삭제할 수 없습니다: ${check.reason}` });
      return;
    }
  }

  const affectedRoomIds = new Set<number>();

  if (roomIds.length > 0) {
    const placeholders = roomIds.map(() => '?').join(',');
    const connectedExits = db
      .prepare(
        `SELECT room_id, direction, target_room_id FROM room_exits
         WHERE room_id IN (${placeholders}) OR target_room_id IN (${placeholders})`,
      )
      .all(...roomIds, ...roomIds) as { room_id: number; direction: string; target_room_id: number }[];

    db.prepare(
      `DELETE FROM room_exits WHERE room_id IN (${placeholders}) OR target_room_id IN (${placeholders})`,
    ).run(...roomIds, ...roomIds);

    for (const exit of connectedExits) {
      removeExit(exit.room_id, exit.direction);
      affectedRoomIds.add(exit.room_id);
      affectedRoomIds.add(exit.target_room_id);
    }
    for (const roomId of roomIds) affectedRoomIds.delete(roomId);

    db.prepare(`DELETE FROM rooms WHERE id IN (${placeholders})`).run(...roomIds);
    for (const roomId of roomIds) unregisterRoom(roomId);
  }

  db.prepare('DELETE FROM zones WHERE id = ?').run(zoneId);

  for (const roomId of affectedRoomIds) broadcastRoomSnapshot(roomId);

  res.status(204).send();
});
