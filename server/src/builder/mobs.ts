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
      `SELECT ms.id, ms.room_id, ms.mob_template_id, ms.respawn_seconds, r.name as room_name, r.zone_id as zone_id,
              mt.name as mob_name, mt.min_level as mob_min_level, mt.max_level as mob_max_level
       FROM mob_spawns ms JOIN rooms r ON r.id = ms.room_id JOIN mob_templates mt ON mt.id = ms.mob_template_id
       ORDER BY ms.id`,
    )
    .all() as {
    id: number;
    room_id: number;
    mob_template_id: number;
    respawn_seconds: number;
    room_name: string;
    zone_id: number;
    mob_name: string;
    mob_min_level: number;
    mob_max_level: number;
  }[];

  res.json({
    mobSpawns: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      zoneId: row.zone_id,
      mobTemplateId: row.mob_template_id,
      mobName: row.mob_name,
      mobMinLevel: row.mob_min_level,
      mobMaxLevel: row.mob_max_level,
      respawnSeconds: row.respawn_seconds,
    })),
  });
});

const mobSpawnSchema = z.object({
  roomId: z.number().int(),
  mobTemplateId: z.number().int(),
  respawnSeconds: z.number().int().min(5).default(20),
});

export type CreateMobSpawnInput = z.infer<typeof mobSpawnSchema>;
export type CreateMobSpawnOutcome = { spawnId: number } | { error: string; status: number };

/** Validates and inserts a mob spawn, registering it with MobManager. Shared by the HTTP route and the map assistant's apply step. */
export function createMobSpawnRecord(input: CreateMobSpawnInput): CreateMobSpawnOutcome {
  const { roomId, mobTemplateId, respawnSeconds } = input;
  if (!getRoom(roomId)) {
    return { error: '방을 찾을 수 없습니다.', status: 404 };
  }

  const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(mobTemplateId) as
    | MobTemplateRow
    | undefined;
  if (!template) {
    return { error: '몹 템플릿을 찾을 수 없습니다.', status: 404 };
  }

  const info = db
    .prepare('INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds) VALUES (?, ?, ?)')
    .run(roomId, mobTemplateId, respawnSeconds);
  const spawnId = Number(info.lastInsertRowid);

  registerMobSpawn(spawnId, roomId, template, respawnSeconds);
  broadcastRoomSnapshot(roomId);

  return { spawnId };
}

builderRouter.post('/mob-spawns', (req, res) => {
  const parsed = mobSpawnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const outcome = createMobSpawnRecord(parsed.data);
  if ('error' in outcome) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }

  res.status(201).json(outcome);
});

builderRouter.delete('/mob-spawns/:id', (req, res) => {
  const spawnId = Number(req.params.id);
  const row = db.prepare('SELECT room_id FROM mob_spawns WHERE id = ?').get(spawnId) as { room_id: number } | undefined;

  db.prepare('DELETE FROM mob_spawns WHERE id = ?').run(spawnId);
  despawnMob(spawnId);
  if (row) broadcastRoomSnapshot(row.room_id);

  res.status(204).send();
});
