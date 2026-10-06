import type { Router } from 'express';
import { parseBody } from '../http/validation.js';
import { z } from 'zod';
import { db } from '../db/client.js';
import { toMobTemplateDto } from '../db/dto.js';
import type { MobTemplateRow } from '../db/types.js';
import { despawnMob, registerMobSpawn } from '../game/MobManager.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { getRoom } from '../game/World.js';

const mobSpawnSchema = z
  .object({
    roomId: z.number().int(),
    mobTemplateId: z.number().int(),
    respawnSeconds: z.number().int().min(5).default(20),
    minLevel: z.number().int().min(1).nullable().optional(),
    maxLevel: z.number().int().min(1).nullable().optional(),
  })
  .refine((data) => !data.minLevel || !data.maxLevel || data.minLevel <= data.maxLevel, {
    message: 'minLevel은 maxLevel보다 클 수 없습니다.',
  });

export type CreateMobSpawnInput = z.infer<typeof mobSpawnSchema>;
export type CreateMobSpawnOutcome = { spawnId: number } | { error: string; status: number };

interface LevelRange {
  minLevel: number;
  maxLevel: number;
}

interface NullableLevelRange {
  minLevel: number | null;
  maxLevel: number | null;
}

export function resolveBossSpawnLevel(
  template: LevelRange,
  zone: NullableLevelRange,
): { level: number } | { error: string } {
  if (zone.minLevel === null || zone.maxLevel === null) {
    return { error: '보스를 배치하려면 먼저 존 레벨 범위를 설정해야 합니다.' };
  }
  if (zone.maxLevel < template.minLevel || zone.maxLevel > template.maxLevel) {
    return {
      error: `존 최고 레벨 Lv.${zone.maxLevel}가 보스 템플릿 범위 Lv.${template.minLevel}-${template.maxLevel}에 포함되지 않습니다.`,
    };
  }
  return { level: zone.maxLevel };
}

/**
 * 레벨대(min_level < max_level)를 갖는 몹 템플릿은 스폰 시점에 이 범위 안에서 레벨을 굴린다
 * (MobManager.rollMobStats). 존의 의도된 레벨보다 몹이 과하게 세거나 약하게 나오는 걸 막으려면
 * 스폰마다 이 굴림 범위를 zone의 레벨대로 좁혀줘야 한다 — 비워두면(null) 템플릿 전체 범위 그대로 굴러간다.
 */
export function createMobSpawnRecord(input: CreateMobSpawnInput): CreateMobSpawnOutcome {
  const { roomId, mobTemplateId, respawnSeconds, minLevel, maxLevel } = input;
  if (!getRoom(roomId)) {
    return { error: '방을 찾을 수 없습니다.', status: 404 };
  }

  const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(mobTemplateId) as
    | MobTemplateRow
    | undefined;
  if (!template) {
    return { error: '몹 템플릿을 찾을 수 없습니다.', status: 404 };
  }

  let overrideMinLevel = minLevel ?? null;
  let overrideMaxLevel = maxLevel ?? null;

  if (template.is_boss) {
    const roomZone = db
      .prepare(
        `SELECT r.zone_id, z.min_level, z.max_level
         FROM rooms r JOIN zones z ON z.id = r.zone_id
         WHERE r.id = ?`,
      )
      .get(roomId) as { zone_id: number; min_level: number | null; max_level: number | null } | undefined;
    if (!roomZone) return { error: '방의 존 정보를 찾을 수 없습니다.', status: 404 };

    const resolved = resolveBossSpawnLevel(
      { minLevel: template.min_level, maxLevel: template.max_level },
      { minLevel: roomZone.min_level, maxLevel: roomZone.max_level },
    );
    if ('error' in resolved) return { error: resolved.error, status: 409 };

    overrideMinLevel = resolved.level;
    overrideMaxLevel = resolved.level;
  }

  const inserted = db.transaction((): CreateMobSpawnOutcome => {
    if (template.is_boss) {
      const existingBoss = db
        .prepare(
          `SELECT 1
           FROM mob_spawns ms
           JOIN rooms existing_room ON existing_room.id = ms.room_id
           JOIN rooms target_room ON target_room.id = ?
           JOIN mob_templates mt ON mt.id = ms.mob_template_id
           WHERE existing_room.zone_id = target_room.zone_id AND mt.is_boss = 1
           LIMIT 1`,
        )
        .get(roomId);
      if (existingBoss) return { error: '이 존에는 이미 보스가 배치되어 있습니다.', status: 409 };
    }
    const info = db
      .prepare(
        'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds, min_level, max_level) VALUES (?, ?, ?, ?, ?)',
      )
      .run(roomId, mobTemplateId, respawnSeconds, overrideMinLevel, overrideMaxLevel);
    return { spawnId: Number(info.lastInsertRowid) };
  })();
  if ('error' in inserted) return inserted;
  const { spawnId } = inserted;

  registerMobSpawn(spawnId, roomId, template, respawnSeconds, overrideMinLevel, overrideMaxLevel);
  broadcastRoomSnapshot(roomId);

  return { spawnId };
}

export function registerMobsRoutes(builderRouter: Router): void {
  builderRouter.get('/mob-templates', (_req, res) => {
    const rows = db.prepare('SELECT * FROM mob_templates ORDER BY id').all() as MobTemplateRow[];
    res.json({ mobTemplates: rows.map(toMobTemplateDto) });
  });

  builderRouter.get('/mob-spawns', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT ms.id, ms.room_id, ms.mob_template_id, ms.respawn_seconds,
                ms.min_level as override_min_level, ms.max_level as override_max_level,
                r.name as room_name, r.zone_id as zone_id,
                mt.name as mob_name, mt.min_level as mob_min_level, mt.max_level as mob_max_level,
                mt.is_boss as is_boss
         FROM mob_spawns ms JOIN rooms r ON r.id = ms.room_id JOIN mob_templates mt ON mt.id = ms.mob_template_id
         ORDER BY ms.id`,
      )
      .all() as {
      id: number;
      room_id: number;
      mob_template_id: number;
      respawn_seconds: number;
      override_min_level: number | null;
      override_max_level: number | null;
      room_name: string;
      zone_id: number;
      mob_name: string;
      mob_min_level: number;
      mob_max_level: number;
      is_boss: number;
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
        isBoss: Boolean(row.is_boss),
        overrideMinLevel: row.override_min_level,
        overrideMaxLevel: row.override_max_level,
        respawnSeconds: row.respawn_seconds,
      })),
    });
  });

  builderRouter.post('/mob-spawns', (req, res) => {
    const parsed = parseBody(mobSpawnSchema, req.body, res);
    if (!parsed) return;

    const outcome = createMobSpawnRecord(parsed);
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
}
