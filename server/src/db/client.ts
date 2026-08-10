import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SQL } from './schema.js';
import { ITEMS, seed } from './seed/index.js';
import { LAST_PROGRESSION_ROOM_ID, PROGRESSION_EXITS, PROGRESSION_MOB_SPAWNS, PROGRESSION_ROOMS, PROGRESSION_ZONES } from './seed/progressionZones.js';

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

migrate(db);
seed(db);
backfillMissingItems(db);
backfillRoomPositions(db);
backfillProgressionZones(db);
backfillZoneLevelRanges(db);
