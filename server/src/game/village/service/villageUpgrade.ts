import { db } from '../../../db/client.js';
import type { VillageRow } from '../../../db/types.js';

export interface UpgradeCost {
  gold: number;
  wood: number;
  ore: number;
  food: number;
}

export function upgradeCost(currentLevel: number): UpgradeCost {
  return {
    gold: 200 * currentLevel,
    wood: 50 * currentLevel,
    ore: 50 * currentLevel,
    food: 50 * currentLevel,
  };
}

export interface UpgradeResult {
  success: boolean;
  error?: string;
  cost?: UpgradeCost;
  newLevel?: number;
}

export function upgradeVillage(village: VillageRow): UpgradeResult {
  const cost = upgradeCost(village.level);

  if (village.gold < cost.gold || village.wood < cost.wood || village.ore < cost.ore || village.food < cost.food) {
    return {
      success: false,
      error: `업그레이드하려면 국고에 gold ${cost.gold}, 목재 ${cost.wood}, 광석 ${cost.ore}, 식량 ${cost.food}이 필요합니다. (현재 gold ${village.gold}, 목재 ${village.wood}, 광석 ${village.ore}, 식량 ${village.food})`,
    };
  }

  const newLevel = village.level + 1;
  db.prepare(
    'UPDATE villages SET level = ?, gold = gold - ?, wood = wood - ?, ore = ore - ?, food = food - ? WHERE id = ?',
  ).run(newLevel, cost.gold, cost.wood, cost.ore, cost.food, village.id);

  return { success: true, cost, newLevel };
}
