import type Database from 'better-sqlite3';
import { getSkillById, totalPassiveBonus } from '@mud/shared';

function ensureColumn(target: Database.Database, table: string, column: string, ddl: string): void {
  const columns = target.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) target.exec(ddl);
}

/** NPC 레벨은 더 이상 템플릿 고정값이 아니라 배치된 방의 존 최대 레벨에서 계산되므로, 남아있는 컬럼은 제거한다. */
function dropColumnIfExists(target: Database.Database, table: string, column: string): void {
  const columns = target.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) target.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

export function migrateSchema(target: Database.Database): void {
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
  ensureColumn(target, 'mob_templates', 'is_boss', 'ALTER TABLE mob_templates ADD COLUMN is_boss INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'mob_loot_pool', 'weight', 'ALTER TABLE mob_loot_pool ADD COLUMN weight INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'zones', 'min_level', 'ALTER TABLE zones ADD COLUMN min_level INTEGER');
  ensureColumn(target, 'zones', 'max_level', 'ALTER TABLE zones ADD COLUMN max_level INTEGER');
  ensureColumn(target, 'mob_spawns', 'min_level', 'ALTER TABLE mob_spawns ADD COLUMN min_level INTEGER');
  ensureColumn(target, 'mob_spawns', 'max_level', 'ALTER TABLE mob_spawns ADD COLUMN max_level INTEGER');
  ensureColumn(target, 'character_skills', 'rank', 'ALTER TABLE character_skills ADD COLUMN rank INTEGER NOT NULL DEFAULT 1');
  ensureColumn(
    target,
    'character_skills',
    'granted_bonus',
    'ALTER TABLE character_skills ADD COLUMN granted_bonus INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    target,
    'inventory_items',
    'sort_order',
    'ALTER TABLE inventory_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
  );
  migrateMobTemplateLevelRangeColumns(target);
  dropColumnIfExists(target, 'npc_templates', 'level');
  backfillGrantedBonus(target);
  backfillInventorySortOrder(target);
}

/**
 * sort_order 컬럼이 막 추가된 기존 행은 전부 0이라 정렬 기준이 없다 — id(생성 순서)로
 * 한 번만 채워 넣는다. 이미 값이 채워진 행(0이 아닌 id 자신)은 다시 덮어쓰지 않으므로 매
 * 시작마다 재실행해도 안전하다(id가 0인 행은 존재하지 않는다).
 */
function backfillInventorySortOrder(target: Database.Database): void {
  target.prepare('UPDATE inventory_items SET sort_order = id WHERE sort_order = 0').run();
}

/**
 * granted_bonus 컬럼이 막 추가된 기존 행(또는 이 컬럼이 생기기 전에 배운 스킬)은 0으로 시작한다.
 * 지금 스킬 정의 기준으로 한 번 채워 넣어야, 나중에 리셋할 때 실제로 부여된 적 없는 값을 빼는
 * 사고가 안 난다 — 이 시점 이후로 배우는/올리는 스킬은 학습/강화 시점에 바로 정확한 값이 저장된다.
 */
function backfillGrantedBonus(target: Database.Database): void {
  const rows = target
    .prepare(`SELECT id, skill_id, rank FROM character_skills WHERE granted_bonus = 0`)
    .all() as { id: number; skill_id: string; rank: number }[];
  if (rows.length === 0) return;

  const update = target.prepare('UPDATE character_skills SET granted_bonus = ? WHERE id = ?');
  const tx = target.transaction(() => {
    for (const row of rows) {
      const skill = getSkillById(row.skill_id);
      if (!skill || skill.kind !== 'passive' || !skill.passiveStat) continue;
      const bonus = totalPassiveBonus(skill, row.rank);
      if (bonus > 0) update.run(bonus, row.id);
    }
  });
  tx();
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
