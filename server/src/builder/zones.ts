import type { Router } from 'express';
import { parseBody } from '../http/validation.js';
import { z } from 'zod';
import { db } from '../db/client.js';
import { despawnMob } from '../game/MobManager.js';
import { despawnNpc } from '../game/NpcManager.js';
import { removeExit, unregisterRoom } from '../game/World.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { canDeleteRoom } from './roomGuard.js';

const zoneLevelFields = {
  minLevel: z.number().int().min(1, '최소 레벨은 1 이상이어야 합니다.'),
  maxLevel: z.number().int().min(1, '최대 레벨은 1 이상이어야 합니다.'),
};

export const zoneUpsertSchema = z
  .object({
    name: z.string().min(1, '존 이름을 입력하세요.').max(30, '존 이름은 30자 이하여야 합니다.'),
    description: z.string().max(200, '설명은 200자 이하여야 합니다.').optional().default(''),
    ...zoneLevelFields,
  })
  .refine((data) => data.minLevel <= data.maxLevel, {
    message: '최소 레벨은 최대 레벨보다 클 수 없습니다.',
    path: ['maxLevel'],
  });

const zoneLevelSchema = z.object(zoneLevelFields).refine((data) => data.minLevel <= data.maxLevel, {
  message: '최소 레벨은 최대 레벨보다 클 수 없습니다.',
  path: ['maxLevel'],
});

export function getZoneLevelUpdateConflict(zoneId: number, nextMaxLevel: number): string | null {
  const zone = db.prepare('SELECT max_level FROM zones WHERE id = ?').get(zoneId) as
    | { max_level: number | null }
    | undefined;
  if (!zone || zone.max_level === nextMaxLevel) return null;
  const placedBoss = db
    .prepare(
      `SELECT 1 FROM mob_spawns ms
       JOIN rooms r ON r.id = ms.room_id
       JOIN mob_templates mt ON mt.id = ms.mob_template_id
       WHERE r.zone_id = ? AND mt.is_boss = 1 LIMIT 1`,
    )
    .get(zoneId);
  return placedBoss ? '보스가 배치된 존의 최고 레벨은 바꿀 수 없습니다. 먼저 보스 배치를 제거하세요.' : null;
}

export function registerZonesRoutes(builderRouter: Router): void {
  builderRouter.get('/zones', (_req, res) => {
    const rows = db.prepare('SELECT id, name, description, min_level, max_level FROM zones ORDER BY id').all() as {
      id: number;
      name: string;
      description: string;
      min_level: number | null;
      max_level: number | null;
    }[];
    const zones = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      minLevel: row.min_level,
      maxLevel: row.max_level,
    }));
    res.json({ zones });
  });

  builderRouter.post('/zones', (req, res) => {
    const parsed = parseBody(zoneUpsertSchema, req.body, res);
    if (!parsed) return;

    const { name, description, minLevel, maxLevel } = parsed;
    if (db.prepare('SELECT 1 FROM zones WHERE name = ?').get(name)) {
      res.status(409).json({ error: '이미 사용 중인 존 이름입니다.' });
      return;
    }

    const info = db
      .prepare('INSERT INTO zones (name, description, min_level, max_level) VALUES (?, ?, ?, ?)')
      .run(name, description, minLevel, maxLevel);
    res.status(201).json({ zone: { id: Number(info.lastInsertRowid), name, description, minLevel, maxLevel } });
  });

  builderRouter.patch('/zones/:id/levels', (req, res) => {
    const zoneId = Number(req.params.id);
    const zone = db.prepare('SELECT max_level FROM zones WHERE id = ?').get(zoneId) as
      | { max_level: number | null }
      | undefined;
    if (!Number.isInteger(zoneId) || !zone) {
      res.status(404).json({ error: '존을 찾을 수 없습니다.' });
      return;
    }
    const parsed = parseBody(zoneLevelSchema, req.body, res);
    if (!parsed) return;
    const { minLevel, maxLevel } = parsed;
    const conflict = getZoneLevelUpdateConflict(zoneId, maxLevel);
    if (conflict) {
      res.status(409).json({ error: conflict });
      return;
    }
    db.prepare('UPDATE zones SET min_level = ?, max_level = ? WHERE id = ?').run(minLevel, maxLevel, zoneId);
    res.json({ minLevel, maxLevel });
  });

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
      const mobSpawnIds = (
        db.prepare(`SELECT id FROM mob_spawns WHERE room_id IN (${placeholders})`).all(...roomIds) as { id: number }[]
      ).map((row) => row.id);
      const npcSpawnIds = (
        db.prepare(`SELECT id FROM npc_spawns WHERE room_id IN (${placeholders})`).all(...roomIds) as { id: number }[]
      ).map((row) => row.id);
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

      db.prepare(`DELETE FROM room_items WHERE room_id IN (${placeholders})`).run(...roomIds);
      db.prepare(`DELETE FROM mob_spawns WHERE room_id IN (${placeholders})`).run(...roomIds);
      db.prepare(`DELETE FROM npc_spawns WHERE room_id IN (${placeholders})`).run(...roomIds);
      db.prepare(`DELETE FROM rooms WHERE id IN (${placeholders})`).run(...roomIds);
      for (const spawnId of mobSpawnIds) despawnMob(spawnId);
      for (const spawnId of npcSpawnIds) despawnNpc(spawnId);
      for (const roomId of roomIds) unregisterRoom(roomId);
    }

    db.prepare('DELETE FROM zones WHERE id = ?').run(zoneId);

    for (const roomId of affectedRoomIds) broadcastRoomSnapshot(roomId);

    res.status(204).send();
  });
}
