import type Database from 'better-sqlite3';
import {
  LAST_BRANCH_ROOM_ID,
  LAST_PROGRESSION_ROOM_ID,
  oppositeBranchDirection,
  PROGRESSION_BRANCH_BLUEPRINTS,
  PROGRESSION_EXITS,
  PROGRESSION_MOB_SPAWNS,
  PROGRESSION_ROOMS,
  PROGRESSION_ZONES,
} from '../seed/progressionZones.js';


/**
 * seed()가 끝난 뒤에도 새로 추가된 레벨대 존(Lv 6-50)을 기존 DB에 한 번만 채워 넣는다.
 * 마지막 존의 마지막 방 id가 이미 있으면 이전에 적용된 것이므로 건너뛴다.
 */
export function backfillProgressionZones(target: Database.Database): void {
  const existing = target.prepare('SELECT id FROM rooms WHERE id = ?').get(LAST_PROGRESSION_ROOM_ID);
  if (existing) return;

  const insertZone = target.prepare(
    'INSERT INTO zones (id, name, description, min_level, max_level) VALUES (?, ?, ?, ?, ?)',
  );
  const insertRoom = target.prepare(
    'INSERT INTO rooms (id, name, description, x, y, zone_id) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertExit = target.prepare(
    'INSERT INTO room_exits (room_id, direction, target_room_id) VALUES (?, ?, ?)',
  );
  const insertMobSpawn = target.prepare(
    'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds, min_level, max_level) VALUES (?, ?, ?, ?, ?)',
  );

  const tx = target.transaction(() => {
    for (const zone of PROGRESSION_ZONES) insertZone.run(zone.id, zone.name, zone.description, zone.minLevel, zone.maxLevel);
    for (const room of PROGRESSION_ROOMS) insertRoom.run(room.id, room.name, room.description, room.x, room.y, room.zoneId);
    for (const exit of PROGRESSION_EXITS) insertExit.run(exit.roomId, exit.direction, exit.targetRoomId);
    for (const spawn of PROGRESSION_MOB_SPAWNS) {
      insertMobSpawn.run(spawn.roomId, spawn.mobTemplateId, spawn.respawnSeconds, spawn.minLevel, spawn.maxLevel);
    }
  });
  tx();
}

/**
 * backfillProgressionZones가 이미 적용된 뒤에 min_level/max_level 컬럼이 추가됐으므로,
 * 기존 존들에도 한 번만 소급해서 채워 넣는다. 이미 값이 있으면(관리자가 직접 고쳤을 수 있으니) 건드리지 않는다.
 */
export function backfillZoneLevelRanges(target: Database.Database): void {
  const updateRange = target.prepare(
    'UPDATE zones SET min_level = ?, max_level = ? WHERE id = ? AND min_level IS NULL',
  );
  const ranges: [number, number, number][] = [[1, 1, 5], ...PROGRESSION_ZONES.map((zone): [number, number, number] => [zone.id, zone.minLevel, zone.maxLevel])];
  const tx = target.transaction(() => {
    for (const [id, minLevel, maxLevel] of ranges) updateRange.run(minLevel, maxLevel, id);
  });
  tx();
}

/**
 * 각 존의 전투방 옆으로 곁방을 뻗어 좌우로 퍼지는 레이아웃을 만든다(방/출구만 — 몹 배치는 맵
 * 빌더에서 관리자가 직접 한다). 마지막 존의 마지막 곁방 id가 이미 있으면 이전에 적용된 것.
 */
export function backfillZoneEnrichment(target: Database.Database): void {
  const existing = target.prepare('SELECT id FROM rooms WHERE id = ?').get(LAST_BRANCH_ROOM_ID);
  if (existing) return;

  const insertRoom = target.prepare(
    'INSERT INTO rooms (id, name, description, x, y, zone_id) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertExit = target.prepare(
    'INSERT INTO room_exits (room_id, direction, target_room_id) VALUES (?, ?, ?)',
  );
  const selectRoomDirections = target.prepare('SELECT direction FROM room_exits WHERE room_id = ?');
  const selectCombatRoomXY = target.prepare('SELECT x, y FROM rooms WHERE id = ?');

  const tx = target.transaction(() => {
    for (const branch of PROGRESSION_BRANCH_BLUEPRINTS) {
      const taken = new Set(
        (selectRoomDirections.all(branch.combatRoomId) as { direction: string }[]).map((row) => row.direction),
      );
      const direction = !taken.has(branch.preferredDirection)
        ? branch.preferredDirection
        : !taken.has(oppositeBranchDirection(branch.preferredDirection))
          ? oppositeBranchDirection(branch.preferredDirection)
          : null;
      if (!direction) continue;

      const combatRoomXY = selectCombatRoomXY.get(branch.combatRoomId) as { x: number; y: number } | undefined;
      if (!combatRoomXY) continue;
      const x = combatRoomXY.x + (direction === 'east' ? 1 : -1);

      insertRoom.run(branch.roomId, branch.name, branch.description, x, combatRoomXY.y, branch.zoneId);
      insertExit.run(branch.combatRoomId, direction, branch.roomId);
      insertExit.run(branch.roomId, oppositeBranchDirection(direction), branch.combatRoomId);
    }
  });
  tx();
}
