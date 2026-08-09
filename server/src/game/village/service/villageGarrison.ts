import { db } from '../../../db/client.js';
import type { VillageRow } from '../../../db/types.js';
import { despawnMob, findMobInRoomByName, findMobTemplateByName, spawnGarrisonMob } from '../../MobManager.js';
import { BUILDING_CATALOG, getVillagePlots } from './villageCore.js';

export const GARRISON_COST_MULTIPLIER = 20;

export function getGarrisonCapacity(villageId: number): number {
  return getVillagePlots(villageId).reduce((total, plot) => {
    if (!plot.building_type) return total;
    return total + (BUILDING_CATALOG[plot.building_type].garrisonSlots ?? 0);
  }, 0);
}

export function getGarrisonCount(villageId: number): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM village_garrison WHERE village_id = ?').get(villageId) as {
    count: number;
  };
  return row.count;
}

export interface AddGarrisonResult {
  success: boolean;
  error?: string;
  cost?: number;
  mobName?: string;
}

export function addGarrisonMob(village: VillageRow, mobName: string): AddGarrisonResult {
  const trimmed = mobName.trim();
  if (!trimmed) {
    return { success: false, error: '배치할 몬스터 이름을 입력하세요. 사용법: village garrison add <몬스터>' };
  }

  const template = findMobTemplateByName(trimmed);
  if (!template) {
    return { success: false, error: '그런 몬스터가 없습니다.' };
  }

  const capacity = getGarrisonCapacity(village.id);
  const count = getGarrisonCount(village.id);
  if (count >= capacity) {
    return {
      success: false,
      error: `수비대 자리가 없습니다. (${count}/${capacity}) 초소(watchtower)를 더 지으세요.`,
    };
  }

  const cost = template.gold_reward * GARRISON_COST_MULTIPLIER;
  if (village.gold < cost) {
    return {
      success: false,
      error: `수비대를 고용하려면 국고에 gold ${cost}이 필요합니다. (현재 ${village.gold})`,
    };
  }

  let garrisonId = 0;
  const tx = db.transaction(() => {
    db.prepare('UPDATE villages SET gold = gold - ? WHERE id = ?').run(cost, village.id);
    const info = db.prepare('INSERT INTO village_garrison (village_id, mob_template_id) VALUES (?, ?)').run(
      village.id,
      template.id,
    );
    garrisonId = Number(info.lastInsertRowid);
  });
  tx();

  spawnGarrisonMob(garrisonId, village.room_id, template);

  return { success: true, cost, mobName: template.name };
}

export interface RemoveGarrisonResult {
  success: boolean;
  error?: string;
  mobName?: string;
}

export function removeGarrisonMob(village: VillageRow, mobName: string): RemoveGarrisonResult {
  const trimmed = mobName.trim();
  if (!trimmed) {
    return { success: false, error: '해고할 수비대 이름을 입력하세요. 사용법: village garrison remove <몬스터>' };
  }

  const mob = findMobInRoomByName(village.room_id, trimmed);
  if (!mob || mob.spawnId >= 0) {
    return { success: false, error: '그런 수비대가 없습니다.' };
  }

  const garrisonId = -mob.spawnId;
  despawnMob(mob.spawnId);
  db.prepare('DELETE FROM village_garrison WHERE id = ?').run(garrisonId);

  return { success: true, mobName: mob.name };
}
