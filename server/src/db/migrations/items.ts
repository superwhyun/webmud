import type Database from 'better-sqlite3';
import { ITEMS } from '../seed/index.js';

/**
 * seed()는 rooms 테이블이 비어 있을 때만(최초 1회) 실행되므로, 이미 세팅된 DB에 ITEMS 배열로
 * 나중에 추가한 기본 아이템(예: 마법 지팡이류)은 여기서 id 기준으로 없는 것만 채워 넣는다.
 * 계정/캐릭터/기존 아이템/관리자가 만든 콘텐츠는 전혀 건드리지 않는다.
 */
export function backfillMissingItems(target: Database.Database): void {
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
