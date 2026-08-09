import { z } from 'zod';
import { db } from '../db/client.js';
import { toMobTemplateDto } from '../db/dto.js';
import type { MobTemplateRow } from '../db/types.js';
import { despawnMob, registerMobSpawn } from '../game/MobManager.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { getRoom } from '../game/World.js';
import { builderRouter } from './router.js';

builderRouter.get('/mob-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM mob_templates ORDER BY id').all() as MobTemplateRow[];
  res.json({ mobTemplates: rows.map(toMobTemplateDto) });
});

builderRouter.get('/mob-spawns', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ms.id, ms.room_id, ms.mob_template_id, ms.respawn_seconds, r.name as room_name, mt.name as mob_name
       FROM mob_spawns ms JOIN rooms r ON r.id = ms.room_id JOIN mob_templates mt ON mt.id = ms.mob_template_id
       ORDER BY ms.id`,
    )
    .all() as {
    id: number;
    room_id: number;
    mob_template_id: number;
    respawn_seconds: number;
    room_name: string;
    mob_name: string;
  }[];

  res.json({
    mobSpawns: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      mobTemplateId: row.mob_template_id,
      mobName: row.mob_name,
      respawnSeconds: row.respawn_seconds,
    })),
  });
});

const mobSpawnSchema = z.object({
  roomId: z.number().int(),
  mobTemplateId: z.number().int(),
  respawnSeconds: z.number().int().min(5).default(20),
});

builderRouter.post('/mob-spawns', (req, res) => {
  const parsed = mobSpawnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, mobTemplateId, respawnSeconds } = parsed.data;
  if (!getRoom(roomId)) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }

  const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(mobTemplateId) as
    | MobTemplateRow
    | undefined;
  if (!template) {
    res.status(404).json({ error: '몹 템플릿을 찾을 수 없습니다.' });
    return;
  }

  const info = db
    .prepare('INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds) VALUES (?, ?, ?)')
    .run(roomId, mobTemplateId, respawnSeconds);
  const spawnId = Number(info.lastInsertRowid);

  registerMobSpawn(spawnId, roomId, template, respawnSeconds);
  broadcastRoomSnapshot(roomId);

  res.status(201).json({ spawnId });
});

builderRouter.delete('/mob-spawns/:id', (req, res) => {
  const spawnId = Number(req.params.id);
  const row = db.prepare('SELECT room_id FROM mob_spawns WHERE id = ?').get(spawnId) as { room_id: number } | undefined;

  db.prepare('DELETE FROM mob_spawns WHERE id = ?').run(spawnId);
  despawnMob(spawnId);
  if (row) broadcastRoomSnapshot(row.room_id);

  res.status(204).send();
});
