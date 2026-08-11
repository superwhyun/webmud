import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SQL } from './schema.js';
import { ITEMS, seed } from './seed/index.js';
import { MOB_LOOT_POOL, MOB_TEMPLATES } from './seed/mobs/index.js';
import {
  LAST_BRANCH_ROOM_ID,
  LAST_PROGRESSION_ROOM_ID,
  oppositeBranchDirection,
  PROGRESSION_BRANCH_BLUEPRINTS,
  PROGRESSION_EXITS,
  PROGRESSION_MOB_SPAWNS,
  PROGRESSION_ROOMS,
  PROGRESSION_ZONES,
} from './seed/progressionZones.js';

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

/** NPC 레벨은 더 이상 템플릿 고정값이 아니라 배치된 방의 존 최대 레벨에서 계산되므로, 남아있는 컬럼은 제거한다. */
function dropColumnIfExists(target: Database.Database, table: string, column: string): void {
  const columns = target.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) target.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
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
  ensureColumn(target, 'mob_templates', 'hostile', 'ALTER TABLE mob_templates ADD COLUMN hostile INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'mob_loot_pool', 'weight', 'ALTER TABLE mob_loot_pool ADD COLUMN weight INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'zones', 'min_level', 'ALTER TABLE zones ADD COLUMN min_level INTEGER');
  ensureColumn(target, 'zones', 'max_level', 'ALTER TABLE zones ADD COLUMN max_level INTEGER');
  ensureColumn(target, 'mob_spawns', 'min_level', 'ALTER TABLE mob_spawns ADD COLUMN min_level INTEGER');
  ensureColumn(target, 'mob_spawns', 'max_level', 'ALTER TABLE mob_spawns ADD COLUMN max_level INTEGER');
  migrateMobTemplateLevelRangeColumns(target);
  dropColumnIfExists(target, 'npc_templates', 'level');
}

/**
 * mob_templates가 고정 레벨 하나(level)만 갖던 것을, 레벨 범위(min_level~max_level)와 그 범위의
 * 최소/최대 스탯을 갖도록 확장한다. 기존 행은 max_level = min_level, 각 *_max = 그 스탯 그대로
 * 백필해서 "범위 없음(고정 레벨)" 상태와 완전히 동일하게 유지한다.
 */
function migrateMobTemplateLevelRangeColumns(target: Database.Database): void {
  const columns = target.prepare('PRAGMA table_info(mob_templates)').all() as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('min_level') && names.has('level')) {
    target.exec('ALTER TABLE mob_templates RENAME COLUMN level TO min_level');
  }
  ensureColumn(target, 'mob_templates', 'max_level', 'ALTER TABLE mob_templates ADD COLUMN max_level INTEGER');
  target.exec('UPDATE mob_templates SET max_level = min_level WHERE max_level IS NULL');

  for (const stat of ['hp', 'strength', 'dexterity', 'physical_defense', 'magic_defense', 'exp_reward', 'gold_reward']) {
    const maxColumn = `${stat}_max`;
    ensureColumn(target, 'mob_templates', maxColumn, `ALTER TABLE mob_templates ADD COLUMN ${maxColumn} INTEGER`);
    target.exec(`UPDATE mob_templates SET ${maxColumn} = ${stat} WHERE ${maxColumn} IS NULL`);
  }
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
    `INSERT OR IGNORE INTO mob_templates
       (id, name, hp, hp_max, strength, strength_max, dexterity, dexterity_max, physical_defense, physical_defense_max,
        magic_defense, magic_defense_max, element, damage_type, exp_reward, exp_reward_max, gold_reward, gold_reward_max,
        min_level, max_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const template of MOB_TEMPLATES) {
    insertMissingMobTemplate.run(
      template.id,
      template.name,
      template.hp,
      template.hpMax,
      template.strength,
      template.strengthMax,
      template.dexterity,
      template.dexterityMax,
      template.physicalDefense,
      template.physicalDefenseMax,
      template.magicDefense,
      template.magicDefenseMax,
      template.element,
      template.damageType,
      template.expReward,
      template.expRewardMax,
      template.goldReward,
      template.goldRewardMax,
      template.minLevel,
      template.maxLevel,
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

/**
 * 각 존의 전투방 옆으로 곁방을 뻗어 좌우로 퍼지는 레이아웃을 만든다(방/출구만 — 몹 배치는 맵
 * 빌더에서 관리자가 직접 한다). 마지막 존의 마지막 곁방 id가 이미 있으면 이전에 적용된 것.
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

interface LevelingSpecies {
  name: string;
  /** 종을 대표하는 mob_templates id — server/src/db/seed/mobs/base.ts에서 고정 배정한 Lv1 앵커 id. */
  survivorId: number;
  /** 예전에 손으로 만들었던 Lv50 앵커 id — 여기서 max 스탯을 가져온 뒤 삭제된다. */
  lv50AnchorId: number;
}

const LEVELING_SPECIES: LevelingSpecies[] = [
  { name: '덩굴괴수', survivorId: 3, lv50AnchorId: 53 },
  { name: '불도마뱀', survivorId: 4, lv50AnchorId: 54 },
  { name: '바위골렘', survivorId: 5, lv50AnchorId: 55 },
  { name: '강철전갈', survivorId: 6, lv50AnchorId: 56 },
  { name: '늪지악어', survivorId: 7, lv50AnchorId: 57 },
];

interface AnchorStatRow {
  hp: number;
  strength: number;
  dexterity: number;
  physical_defense: number;
  magic_defense: number;
  exp_reward: number;
  gold_reward: number;
}

/**
 * 예전 5종 앙커 시스템(종당 레벨 1,5,10,...,50에 손으로 만든 템플릿 11개, id 3~57)을 종당 1개의
 * 범위형 템플릿(id 3~7, min_level=1/max_level=50)으로 합친다. mob_spawns.mob_template_id는
 * 원래도 항상 각 종의 Lv1 앵커 id(3~7)를 저장해왔으므로, 그 행을 그대로 확장해 재사용하면 기존
 * 스폰 참조가 끊기지 않는다. 나머지 앵커(Lv5~45, 그리고 Lv50)는 루팅 풀을 합친 뒤 삭제한다.
 * 이미 합쳐졌으면(옛 Lv50 앵커가 하나도 안 남아있으면) 건너뛴다. 8~57 구간은 이후 존별 진화형
 * 몹(base.ts) id로 영구히 재사용되므로, 그 범위 존재 여부가 아니라 Lv50 앵커 id만 정확히 짚어서 확인한다.
 */
function collapseLevelingSpeciesAnchors(target: Database.Database): void {
  const lv50AnchorIds = LEVELING_SPECIES.map((species) => species.lv50AnchorId);
  const placeholders = lv50AnchorIds.map(() => '?').join(', ');
  const remainingAnchor = target.prepare(`SELECT id FROM mob_templates WHERE id IN (${placeholders}) LIMIT 1`).get(...lv50AnchorIds);
  if (!remainingAnchor) return;

  const getTemplate = target.prepare(
    'SELECT hp, strength, dexterity, physical_defense, magic_defense, exp_reward, gold_reward FROM mob_templates WHERE id = ?',
  );
  const updateSurvivor = target.prepare(
    `UPDATE mob_templates SET max_level = 50, hp_max = ?, strength_max = ?, dexterity_max = ?,
       physical_defense_max = ?, magic_defense_max = ?, exp_reward_max = ?, gold_reward_max = ?
     WHERE id = ?`,
  );
  const mergeLootPool = target.prepare(
    `INSERT INTO mob_loot_pool (mob_template_id, item_id, weight)
     SELECT ?, item_id, MAX(weight) FROM mob_loot_pool WHERE mob_template_id = ? GROUP BY item_id
     ON CONFLICT(mob_template_id, item_id) DO UPDATE SET weight = MAX(mob_loot_pool.weight, excluded.weight)`,
  );
  const repointSpawns = target.prepare('UPDATE mob_spawns SET mob_template_id = ? WHERE mob_template_id = ?');
  const repointGarrison = target.prepare('UPDATE village_garrison SET mob_template_id = ? WHERE mob_template_id = ?');
  const deleteLootPool = target.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ?');
  const deleteTemplate = target.prepare('DELETE FROM mob_templates WHERE id = ?');
  const selectOtherAnchors = target.prepare('SELECT id FROM mob_templates WHERE name = ? AND id != ?');

  const tx = target.transaction(() => {
    for (const species of LEVELING_SPECIES) {
      const lv50 = getTemplate.get(species.lv50AnchorId) as AnchorStatRow | undefined;
      if (lv50) {
        updateSurvivor.run(
          lv50.hp,
          lv50.strength,
          lv50.dexterity,
          lv50.physical_defense,
          lv50.magic_defense,
          lv50.exp_reward,
          lv50.gold_reward,
          species.survivorId,
        );
      }

      const otherAnchors = selectOtherAnchors.all(species.name, species.survivorId) as { id: number }[];
      for (const anchor of otherAnchors) {
        mergeLootPool.run(species.survivorId, anchor.id);
        repointSpawns.run(species.survivorId, anchor.id);
        repointGarrison.run(species.survivorId, anchor.id);
        deleteLootPool.run(anchor.id);
        deleteTemplate.run(anchor.id);
      }
    }
  });
  tx();
}

/**
 * PROGRESSION_MOB_SPAWNS가 예전엔 모든 존에 동일한 5개 종 id([3,4,5,6,7])만 배치했는데, 이제
 * 존의 레벨 구간에 맞는 진화형 id(base.ts의 5단계 계열)를 쓰도록 바뀌었다. 이미 들어간 진행 존
 * mob_spawns(200~1015번 방)를 한 번만 지우고 새 로직으로 다시 채운다. 지하 대동굴(Lv26-30) 첫
 * 전투방이 이미 그 구간의 진화형 id를 참조하고 있으면(=한 번 적용됐으면) 건너뛴다.
 */
function backfillZoneSpeciesTiers(target: Database.Database): void {
  const marker = PROGRESSION_MOB_SPAWNS.find((spawn) => spawn.roomId === 602);
  if (!marker) return;
  const alreadyApplied = target
    .prepare('SELECT id FROM mob_spawns WHERE room_id = ? AND mob_template_id = ?')
    .get(marker.roomId, marker.mobTemplateId);
  if (alreadyApplied) return;

  const insertMobSpawn = target.prepare(
    'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds, min_level, max_level) VALUES (?, ?, ?, ?, ?)',
  );
  const tx = target.transaction(() => {
    target.prepare('DELETE FROM mob_spawns WHERE room_id BETWEEN 200 AND 1015').run();
    for (const spawn of PROGRESSION_MOB_SPAWNS) {
      insertMobSpawn.run(spawn.roomId, spawn.mobTemplateId, spawn.respawnSeconds, spawn.minLevel, spawn.maxLevel);
    }
  });
  tx();
}

/**
 * collapseLevelingSpeciesAnchors가 만들어둔 id 3~7은 그때 min_level=1/max_level=50짜리 범위형
 * 템플릿이었다. base.ts가 그 뒤 5단계 진화형 체계로 바뀌면서 1~10 구간으로 좁혀졌는데,
 * backfillMissingMobTemplates는 INSERT OR IGNORE라 이미 있는 이 행들을 갱신하지 못한다.
 * base.ts의 정의값으로 통째로 덮어써서 맞춘다. 이미 좁혀졌으면(max_level이 50이 아니면) 건너뛴다.
 */
function backfillNarrowLevelingSpeciesTier1(target: Database.Database): void {
  const tier1Templates = MOB_TEMPLATES.filter((template) => [3, 4, 5, 6, 7].includes(template.id));
  const updateTemplate = target.prepare(
    `UPDATE mob_templates SET
       name = ?, hp = ?, hp_max = ?, strength = ?, strength_max = ?, dexterity = ?, dexterity_max = ?,
       physical_defense = ?, physical_defense_max = ?, magic_defense = ?, magic_defense_max = ?,
       element = ?, damage_type = ?, exp_reward = ?, exp_reward_max = ?, gold_reward = ?, gold_reward_max = ?,
       min_level = ?, max_level = ?
     WHERE id = ? AND max_level = 50`,
  );
  const tx = target.transaction(() => {
    for (const template of tier1Templates) {
      updateTemplate.run(
        template.name,
        template.hp,
        template.hpMax,
        template.strength,
        template.strengthMax,
        template.dexterity,
        template.dexterityMax,
        template.physicalDefense,
        template.physicalDefenseMax,
        template.magicDefense,
        template.magicDefenseMax,
        template.element,
        template.damageType,
        template.expReward,
        template.expRewardMax,
        template.goldReward,
        template.goldRewardMax,
        template.minLevel,
        template.maxLevel,
        template.id,
      );
    }
  });
  tx();
}

/** MOB_LOOT_POOL에서 쥐/고블린 + 레벨링 존 5계열×5단계(id 1~27) 몹의 루팅 풀만 추린다. */
const LEVEL_SCALED_LOOT_MOB_TEMPLATE_IDS = Array.from({ length: 27 }, (_, i) => i + 1);

/**
 * mob_loot_pool.weight를 "상대 가중치"에서 "레벨 배수(1~10배)가 곱해지는 기본 확률(%)"로
 * 재해석하면서, 1~10레벨 5종(id 3~7)의 루팅 풀을 리셋하고 계열별로 겹치지 않는 장비로
 * 재배정한다. 아직 루팅 풀이 없던 나머지 진화형(id 8~27)도 이때 함께 채운다. id 3의 루팅
 * 풀이 이미 새 목록(아이템1 weight3)과 일치하면(=한 번 적용됐으면) 건너뛴다.
 */
function backfillLevelScaledLootPool(target: Database.Database): void {
  const alreadyApplied = target
    .prepare('SELECT id FROM mob_loot_pool WHERE mob_template_id = 3 AND item_id = 1 AND weight = 3')
    .get();
  if (alreadyApplied) return;

  const deleteLoot = target.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ?');
  const insertLoot = target.prepare('INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)');

  const tx = target.transaction(() => {
    for (const templateId of LEVEL_SCALED_LOOT_MOB_TEMPLATE_IDS) deleteLoot.run(templateId);
    for (const entry of MOB_LOOT_POOL) {
      if (!LEVEL_SCALED_LOOT_MOB_TEMPLATE_IDS.includes(entry.mobTemplateId)) continue;
      insertLoot.run(entry.mobTemplateId, entry.itemId, entry.weight);
    }
  });
  tx();
}

/** id 상수 — mob_template_id로 저장되는 종 앵커(1~57)보다 위, 예전에 만들었던 레벨별 보간 템플릿(1000~) 구간. */
const LEGACY_INTERPOLATED_MOB_TEMPLATE_ID_FLOOR = 1000;

/**
 * 예전엔 종*레벨마다 mob_templates 행을 245개 미리 만들어뒀는데, 이제 스폰 시점에 즉석으로 계산하는
 * 방식으로 바꾸면서 필요 없어졌다. 남아있으면 관리자 몹 목록만 지저분해지므로 정리한다.
 */
function backfillRemoveLegacyInterpolatedMobTemplates(target: Database.Database): void {
  const existing = target
    .prepare('SELECT id FROM mob_templates WHERE id >= ? LIMIT 1')
    .get(LEGACY_INTERPOLATED_MOB_TEMPLATE_ID_FLOOR);
  if (!existing) return;

  const tx = target.transaction(() => {
    target.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id >= ?').run(LEGACY_INTERPOLATED_MOB_TEMPLATE_ID_FLOOR);
    target.prepare('DELETE FROM mob_spawns WHERE mob_template_id >= ?').run(LEGACY_INTERPOLATED_MOB_TEMPLATE_ID_FLOOR);
    target.prepare('DELETE FROM mob_templates WHERE id >= ?').run(LEGACY_INTERPOLATED_MOB_TEMPLATE_ID_FLOOR);
  });
  tx();
}

migrate(db);
seed(db);
backfillMissingItems(db);
backfillMissingMobTemplates(db);
backfillRoomPositions(db);
backfillProgressionZones(db);
backfillZoneLevelRanges(db);
backfillZoneEnrichment(db);
collapseLevelingSpeciesAnchors(db);
backfillNarrowLevelingSpeciesTier1(db);
backfillZoneSpeciesTiers(db);
backfillLevelScaledLootPool(db);
backfillRemoveLegacyInterpolatedMobTemplates(db);
