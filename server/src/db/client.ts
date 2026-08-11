import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SQL } from './schema.js';
import { ITEMS, seed } from './seed/index.js';
import { MOB_TEMPLATES } from './seed/mobs/index.js';
import { MOB_LOOT_POOL_INTERPOLATED, SPECIES_NAMES } from './seed/mobs/interpolated.js';
import {
  LAST_BRANCH_ROOM_ID,
  LAST_PROGRESSION_ROOM_ID,
  oppositeBranchDirection,
  PROGRESSION_BRANCH_BLUEPRINTS,
  PROGRESSION_EXITS,
  PROGRESSION_MOB_SPAWNS,
  PROGRESSION_ROOMS,
  PROGRESSION_ZONES,
  randomMobSelection,
  ZONE_MOB_POOLS,
} from './seed/progressionZones.js';

/** 구대륙(존1, Lv1-5)의 사냥 가능 방. 시작 마을(1~5)은 제외. */
const FRONTIER_ZONE_COMBAT_ROOM_IDS = [6, 7, 8, 9];
const FRONTIER_ZONE_MIN_LEVEL = 1;
const FRONTIER_ZONE_MAX_LEVEL = 5;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH ?? join(dataDir, 'mud.sqlite');

export const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');
db.exec(SCHEMA_SQL);

function ensureColumn(target: Database.Database, table: string, column: string, ddl: string): void {
  const columns = target.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) target.exec(ddl);
}

function migrate(target: Database.Database): void {
  target.prepare("INSERT OR IGNORE INTO zones (id, name, description) VALUES (1, '구대륙', '')").run();

  ensureColumn(target, 'room_exits', 'blocked', 'ALTER TABLE room_exits ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'rooms', 'x', 'ALTER TABLE rooms ADD COLUMN x INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'rooms', 'y', 'ALTER TABLE rooms ADD COLUMN y INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'rooms', 'zone_id', 'ALTER TABLE rooms ADD COLUMN zone_id INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'items', 'slot', 'ALTER TABLE items ADD COLUMN slot TEXT');
  ensureColumn(target, 'items', 'level', 'ALTER TABLE items ADD COLUMN level INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'items', 'grade', "ALTER TABLE items ADD COLUMN grade TEXT NOT NULL DEFAULT 'low'");
  ensureColumn(
    target,
    'items',
    'attack_power_bonus',
    'ALTER TABLE items ADD COLUMN attack_power_bonus INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(target, 'items', 'mana_amount', 'ALTER TABLE items ADD COLUMN mana_amount INTEGER NOT NULL DEFAULT 0');
  ensureColumn(
    target,
    'items',
    'intelligence_bonus',
    'ALTER TABLE items ADD COLUMN intelligence_bonus INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(target, 'characters', 'mp', 'ALTER TABLE characters ADD COLUMN mp INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'characters', 'max_mp', 'ALTER TABLE characters ADD COLUMN max_mp INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'characters', 'job', 'ALTER TABLE characters ADD COLUMN job TEXT');
  ensureColumn(
    target,
    'characters',
    'intelligence',
    'ALTER TABLE characters ADD COLUMN intelligence INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    target,
    'characters',
    'vitality',
    'ALTER TABLE characters ADD COLUMN vitality INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(target, 'characters', 'wisdom', 'ALTER TABLE characters ADD COLUMN wisdom INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'characters', 'luck', 'ALTER TABLE characters ADD COLUMN luck INTEGER NOT NULL DEFAULT 0');
  ensureColumn(
    target,
    'characters',
    'unallocated_stat_points',
    'ALTER TABLE characters ADD COLUMN unallocated_stat_points INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    target,
    'characters',
    'unallocated_skill_points',
    'ALTER TABLE characters ADD COLUMN unallocated_skill_points INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(target, 'mob_templates', 'level', 'ALTER TABLE mob_templates ADD COLUMN level INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'mob_templates', 'hostile', 'ALTER TABLE mob_templates ADD COLUMN hostile INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'mob_loot_pool', 'weight', 'ALTER TABLE mob_loot_pool ADD COLUMN weight INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'zones', 'min_level', 'ALTER TABLE zones ADD COLUMN min_level INTEGER');
  ensureColumn(target, 'zones', 'max_level', 'ALTER TABLE zones ADD COLUMN max_level INTEGER');
}

interface ExitEdgeRow {
  room_id: number;
  direction: string;
  target_room_id: number;
}

const GRID_OFFSET: Record<string, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

/** One-time backfill: derives grid coordinates from the existing cardinal exit graph for rooms created before positions existed. */
function backfillRoomPositions(target: Database.Database): void {
  const positioned = target.prepare('SELECT COUNT(*) as c FROM rooms WHERE x != 0 OR y != 0').get() as { c: number };
  if (positioned.c > 0) return;

  const rooms = target.prepare('SELECT id FROM rooms').all() as { id: number }[];
  if (rooms.length === 0) return;

  const edges = target
    .prepare(
      `SELECT room_id, direction, target_room_id FROM room_exits WHERE direction IN ('north','south','east','west')`,
    )
    .all() as ExitEdgeRow[];

  const edgesByRoom = new Map<number, ExitEdgeRow[]>();
  for (const edge of edges) {
    const list = edgesByRoom.get(edge.room_id) ?? [];
    list.push(edge);
    edgesByRoom.set(edge.room_id, list);
  }

  const positions = new Map<number, [number, number]>();
  positions.set(rooms[0].id, [0, 0]);
  const queue = [rooms[0].id];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const [cx, cy] = positions.get(currentId)!;
    for (const edge of edgesByRoom.get(currentId) ?? []) {
      if (positions.has(edge.target_room_id)) continue;
      const [dx, dy] = GRID_OFFSET[edge.direction];
      positions.set(edge.target_room_id, [cx + dx, cy + dy]);
      queue.push(edge.target_room_id);
    }
  }

  let nextRow = 0;
  for (const [, y] of positions.values()) nextRow = Math.max(nextRow, y + 2);
  let col = 0;
  for (const room of rooms) {
    if (!positions.has(room.id)) {
      positions.set(room.id, [col, nextRow]);
      col += 1;
    }
  }

  const updatePosition = target.prepare('UPDATE rooms SET x = ?, y = ? WHERE id = ?');
  const tx = target.transaction(() => {
    for (const [id, [x, y]] of positions) updatePosition.run(x, y, id);
  });
  tx();
}

/**
 * seed()는 rooms 테이블이 비어 있을 때만(최초 1회) 실행되므로, 이미 세팅된 DB에 ITEMS 배열로
 * 나중에 추가한 기본 아이템(예: 마법 지팡이류)은 여기서 id 기준으로 없는 것만 채워 넣는다.
 * 계정/캐릭터/기존 아이템/관리자가 만든 콘텐츠는 전혀 건드리지 않는다.
 */
function backfillMissingItems(target: Database.Database): void {
  const insertMissingItem = target.prepare(
    `INSERT OR IGNORE INTO items (id, name, description, type, slot, level, grade, strength_bonus, dexterity_bonus, attack_power_bonus, intelligence_bonus, physical_defense_bonus, magic_defense_bonus, heal_amount, mana_amount, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const item of ITEMS) {
    insertMissingItem.run(
      item.id,
      item.name,
      item.description,
      item.type,
      item.slot,
      item.level,
      item.grade,
      item.strengthBonus,
      item.dexterityBonus,
      item.attackPowerBonus,
      item.intelligenceBonus,
      item.physicalDefenseBonus,
      item.magicDefenseBonus,
      item.healAmount,
      item.manaAmount,
      item.value,
    );
  }
}

/**
 * seed()는 mob_templates가 비어 있을 때만 채워지므로, 나중에 보간으로 추가한 레벨별 몹 템플릿을
 * 이미 세팅된 DB에도 id 기준으로 없는 것만 채워 넣는다.
 */
function backfillMissingMobTemplates(target: Database.Database): void {
  const insertMissingMobTemplate = target.prepare(
    `INSERT OR IGNORE INTO mob_templates (id, name, hp, strength, dexterity, physical_defense, magic_defense, element, damage_type, exp_reward, gold_reward, level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const template of MOB_TEMPLATES) {
    insertMissingMobTemplate.run(
      template.id,
      template.name,
      template.hp,
      template.strength,
      template.dexterity,
      template.physicalDefense,
      template.magicDefense,
      template.element,
      template.damageType,
      template.expReward,
      template.goldReward,
      template.level,
    );
  }
}

/**
 * 보간된 몹 템플릿의 루팅 풀도 같은 방식으로 소급 적용한다. mob_loot_pool엔 고유 제약이 없어
 * INSERT OR IGNORE로는 중복을 막을 수 없으므로, 첫 보간 항목이 이미 있는지로 게이트를 건다.
 */
function backfillMissingMobLoot(target: Database.Database): void {
  if (MOB_LOOT_POOL_INTERPOLATED.length === 0) return;
  const sentinel = MOB_LOOT_POOL_INTERPOLATED[0];
  const existing = target
    .prepare('SELECT id FROM mob_loot_pool WHERE mob_template_id = ? AND item_id = ?')
    .get(sentinel.mobTemplateId, sentinel.itemId);
  if (existing) return;

  const insertLoot = target.prepare('INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)');
  const tx = target.transaction(() => {
    for (const entry of MOB_LOOT_POOL_INTERPOLATED) insertLoot.run(entry.mobTemplateId, entry.itemId, entry.weight);
  });
  tx();
}

/**
 * seed()가 끝난 뒤에도 새로 추가된 레벨대 존(Lv 6-50)을 기존 DB에 한 번만 채워 넣는다.
 * 마지막 존의 마지막 방 id가 이미 있으면 이전에 적용된 것이므로 건너뛴다.
 */
function backfillProgressionZones(target: Database.Database): void {
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
    'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds) VALUES (?, ?, ?)',
  );

  const tx = target.transaction(() => {
    for (const zone of PROGRESSION_ZONES) insertZone.run(zone.id, zone.name, zone.description, zone.minLevel, zone.maxLevel);
    for (const room of PROGRESSION_ROOMS) insertRoom.run(room.id, room.name, room.description, room.x, room.y, room.zoneId);
    for (const exit of PROGRESSION_EXITS) insertExit.run(exit.roomId, exit.direction, exit.targetRoomId);
    for (const spawn of PROGRESSION_MOB_SPAWNS) insertMobSpawn.run(spawn.roomId, spawn.mobTemplateId, spawn.respawnSeconds);
  });
  tx();
}

/**
 * backfillProgressionZones가 이미 적용된 뒤에 min_level/max_level 컬럼이 추가됐으므로,
 * 기존 존들에도 한 번만 소급해서 채워 넣는다. 이미 값이 있으면(관리자가 직접 고쳤을 수 있으니) 건드리지 않는다.
 */
function backfillZoneLevelRanges(target: Database.Database): void {
  const updateRange = target.prepare(
    'UPDATE zones SET min_level = ?, max_level = ? WHERE id = ? AND min_level IS NULL',
  );
  const ranges: [number, number, number][] = [[1, 1, 5], ...PROGRESSION_ZONES.map((zone): [number, number, number] => [zone.id, zone.minLevel, zone.maxLevel])];
  const tx = target.transaction(() => {
    for (const [id, minLevel, maxLevel] of ranges) updateRange.run(minLevel, maxLevel, id);
  });
  tx();
}

const EXISTING_COMBAT_ROOM_RESPAWN_SECONDS = 20;

/** 어떤 방에 이미 배치된 몹의 "종 이름" 집합을 구한다 — 레벨(id)이 달라도 같은 종이면 중복으로 취급한다. */
function existingSpeciesNamesInRoom(target: Database.Database, roomId: number): Set<string> {
  const rows = target
    .prepare(
      `SELECT mt.name as name FROM mob_spawns ms JOIN mob_templates mt ON mt.id = ms.mob_template_id WHERE ms.room_id = ?`,
    )
    .all(roomId) as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

/** 이미 몹이 있는 방에, 겹치지 않는 종으로 1~5마리가 될 때까지 무작위로 추가한다. */
function topUpRoomMobDiversity(
  target: Database.Database,
  insertMobSpawn: Database.Statement,
  roomId: number,
  minLevel: number,
  maxLevel: number,
  respawnSeconds: number,
): void {
  const existingSpeciesNames = existingSpeciesNamesInRoom(target, roomId);
  const targetCount = 1 + Math.floor(Math.random() * SPECIES_NAMES.length);
  const need = targetCount - existingSpeciesNames.size;
  if (need <= 0) return;

  const additions = randomMobSelection(minLevel, maxLevel, { excludeSpeciesNames: existingSpeciesNames, count: need });
  for (const mobTemplateId of additions) insertMobSpawn.run(roomId, mobTemplateId, respawnSeconds);
}

/**
 * 각 존의 전투방 옆으로 곁방을 뻗어 좌우로 퍼지는 레이아웃을 만들고, 곁방과 기존 전투방 모두
 * 몹을 1~5마리 무작위로(레벨도 브라켓 안에서 고르게) 채운다. 마지막 존의 마지막 곁방 id가
 * 이미 있으면 이전에 적용된 것.
 */
function backfillZoneEnrichment(target: Database.Database): void {
  const existing = target.prepare('SELECT id FROM rooms WHERE id = ?').get(LAST_BRANCH_ROOM_ID);
  if (existing) return;

  const insertRoom = target.prepare(
    'INSERT INTO rooms (id, name, description, x, y, zone_id) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertExit = target.prepare(
    'INSERT INTO room_exits (room_id, direction, target_room_id) VALUES (?, ?, ?)',
  );
  const insertMobSpawn = target.prepare(
    'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds) VALUES (?, ?, ?)',
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
      for (const mobTemplateId of randomMobSelection(branch.minLevel, branch.maxLevel)) {
        insertMobSpawn.run(branch.roomId, mobTemplateId, branch.respawnSeconds);
      }
    }

    for (const pool of ZONE_MOB_POOLS) {
      for (const roomId of pool.combatRoomIds) {
        topUpRoomMobDiversity(target, insertMobSpawn, roomId, pool.minLevel, pool.maxLevel, EXISTING_COMBAT_ROOM_RESPAWN_SECONDS);
      }
    }
  });
  tx();
}

/**
 * backfillZoneEnrichment는 이미 적용된 뒤라 재실행되지 않으므로, 그때 넣은 몹이 전부 브라켓
 * 최대 레벨(5,10,15,...)에 몰려있던 기존 데이터를 한 번만 삭제하고 새 로직으로 다시 채운다.
 * 존3 첫 전투방(202)의 주 몹이 이미 새 레벨(브라켓 최소 레벨)로 들어가 있으면 건너뛴다 —
 * 신규 설치는 backfillProgressionZones/backfillZoneEnrichment가 처음부터 새 로직을 쓰므로 항상 여길 건너뛴다.
 */
function backfillMobLevelDiversity(target: Database.Database): void {
  const marker = PROGRESSION_MOB_SPAWNS[0];
  const alreadyApplied = target
    .prepare('SELECT id FROM mob_spawns WHERE room_id = ? AND mob_template_id = ?')
    .get(marker.roomId, marker.mobTemplateId);
  if (alreadyApplied) return;

  const insertMobSpawn = target.prepare(
    'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds) VALUES (?, ?, ?)',
  );
  const selectRoomExists = target.prepare('SELECT id FROM rooms WHERE id = ?');

  const tx = target.transaction(() => {
    target.prepare('DELETE FROM mob_spawns WHERE room_id BETWEEN 200 AND 1015').run();

    for (const spawn of PROGRESSION_MOB_SPAWNS) insertMobSpawn.run(spawn.roomId, spawn.mobTemplateId, spawn.respawnSeconds);

    for (const branch of PROGRESSION_BRANCH_BLUEPRINTS) {
      if (!selectRoomExists.get(branch.roomId)) continue;
      for (const mobTemplateId of randomMobSelection(branch.minLevel, branch.maxLevel)) {
        insertMobSpawn.run(branch.roomId, mobTemplateId, branch.respawnSeconds);
      }
    }

    for (const pool of ZONE_MOB_POOLS) {
      for (const roomId of pool.combatRoomIds) {
        topUpRoomMobDiversity(target, insertMobSpawn, roomId, pool.minLevel, pool.maxLevel, EXISTING_COMBAT_ROOM_RESPAWN_SECONDS);
      }
    }
  });
  tx();
}

/**
 * 구대륙(존1, Lv1-5)은 5종 몹 시스템이 아니라 쥐/고블린만 배치돼 있었다. 기존 몹은 그대로 두고,
 * 5종을 레벨 1~5로 고르게 섞어 사냥터에 다양성을 더한다. 이미 5종 중 하나라도 배치돼 있으면 건너뛴다.
 */
function backfillFrontierZoneMobVariety(target: Database.Database): void {
  const speciesPlaceholders = SPECIES_NAMES.map(() => '?').join(', ');
  const alreadyApplied = target
    .prepare(
      `SELECT ms.id FROM mob_spawns ms JOIN mob_templates mt ON mt.id = ms.mob_template_id
       WHERE ms.room_id IN (${FRONTIER_ZONE_COMBAT_ROOM_IDS.map(() => '?').join(', ')}) AND mt.name IN (${speciesPlaceholders})
       LIMIT 1`,
    )
    .get(...FRONTIER_ZONE_COMBAT_ROOM_IDS, ...SPECIES_NAMES);
  if (alreadyApplied) return;

  const insertMobSpawn = target.prepare(
    'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds) VALUES (?, ?, ?)',
  );
  const tx = target.transaction(() => {
    for (const roomId of FRONTIER_ZONE_COMBAT_ROOM_IDS) {
      const mobTemplateIds = randomMobSelection(FRONTIER_ZONE_MIN_LEVEL, FRONTIER_ZONE_MAX_LEVEL);
      for (const mobTemplateId of mobTemplateIds) {
        insertMobSpawn.run(roomId, mobTemplateId, EXISTING_COMBAT_ROOM_RESPAWN_SECONDS);
      }
    }
  });
  tx();
}

migrate(db);
seed(db);
backfillMissingItems(db);
backfillMissingMobTemplates(db);
backfillMissingMobLoot(db);
backfillRoomPositions(db);
backfillProgressionZones(db);
backfillZoneLevelRanges(db);
backfillZoneEnrichment(db);
backfillMobLevelDiversity(db);
backfillFrontierZoneMobVariety(db);
