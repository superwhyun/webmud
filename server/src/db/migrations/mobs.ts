import type Database from 'better-sqlite3';
import { MOB_LOOT_POOL, MOB_TEMPLATES } from '../seed/mobs/index.js';
import { PROGRESSION_MOB_SPAWNS } from '../seed/progressionZones.js';

/**
 * seed()는 mob_templates가 비어 있을 때만 채워지므로, 나중에 보간으로 추가한 레벨별 몹 템플릿을
 * 이미 세팅된 DB에도 id 기준으로 없는 것만 채워 넣는다.
 */
export function backfillMissingMobTemplates(target: Database.Database): void {
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
export function collapseLevelingSpeciesAnchors(target: Database.Database): void {
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
export function backfillZoneSpeciesTiers(target: Database.Database): void {
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
export function backfillNarrowLevelingSpeciesTier1(target: Database.Database): void {
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
export function backfillLevelScaledLootPool(target: Database.Database): void {
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
export function backfillRemoveLegacyInterpolatedMobTemplates(target: Database.Database): void {
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

/** 고블린(마법 속성)에게 하급 마나 물약(itemId 100) 드랍을 추가한다. backfillLevelScaledLootPool은 이미 한 번 적용됐으면 건너뛰므로 별도로 채워 넣는다. */
export function backfillGoblinManaPotionLoot(target: Database.Database): void {
  const alreadyApplied = target.prepare('SELECT id FROM mob_loot_pool WHERE mob_template_id = 2 AND item_id = 100').get();
  if (alreadyApplied) return;

  target.prepare('INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)').run(2, 100, 5);
}
