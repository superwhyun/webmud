import { db } from '../../../db/client.js';
import type { BuildingType, VillagePlotRow, VillageRow } from '../../../db/types.js';
import { BUILDING_CATALOG, type BuildingDefinition, findVillageByCharacterMembership, getVillagePlots, nextPlotCost } from './villageCore.js';

export interface BuyLandResult {
  success: boolean;
  error?: string;
  cost?: number;
  plotIndex?: number;
}

export function buyLand(village: VillageRow): BuyLandResult {
  const plots = getVillagePlots(village.id);
  const cost = nextPlotCost(plots.length);

  if (village.gold < cost) {
    return { success: false, error: `땅을 사려면 국고에 gold ${cost}이 필요합니다. (현재 ${village.gold})` };
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE villages SET gold = gold - ? WHERE id = ?').run(cost, village.id);
    db.prepare('INSERT INTO village_plots (village_id, plot_index) VALUES (?, ?)').run(village.id, plots.length);
  });
  tx();

  return { success: true, cost, plotIndex: plots.length };
}

export interface DepositResult {
  success: boolean;
  error?: string;
}

export function depositGold(
  village: VillageRow,
  characterId: number,
  characterGold: number,
  amount: number,
): DepositResult {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, error: '기부할 금액은 1 이상의 정수여야 합니다.' };
  }
  if (characterGold < amount) {
    return { success: false, error: `gold가 부족합니다. (보유 ${characterGold})` };
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(amount, characterId);
    db.prepare('UPDATE villages SET gold = gold + ? WHERE id = ?').run(amount, village.id);
  });
  tx();

  return { success: true };
}

export interface BuildResult {
  success: boolean;
  error?: string;
  building?: BuildingDefinition;
}

export function buildOnPlot(village: VillageRow, plotIndex: number, buildingType: string): BuildResult {
  const definition = BUILDING_CATALOG[buildingType as BuildingType];
  if (!definition) {
    const options = Object.values(BUILDING_CATALOG)
      .map((b) => `${b.type}(${b.name})`)
      .join(', ');
    return { success: false, error: `알 수 없는 건물 종류입니다. 가능한 종류: ${options}` };
  }

  const plot = db
    .prepare('SELECT * FROM village_plots WHERE village_id = ? AND plot_index = ?')
    .get(village.id, plotIndex) as VillagePlotRow | undefined;

  if (!plot) {
    return { success: false, error: '그런 땅 칸이 없습니다.' };
  }
  if (plot.building_type) {
    return { success: false, error: '이미 건물이 있는 칸입니다.' };
  }
  if (village.gold < definition.cost) {
    return {
      success: false,
      error: `건설하려면 국고에 gold ${definition.cost}이 필요합니다. (현재 ${village.gold})`,
    };
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE villages SET gold = gold - ? WHERE id = ?').run(definition.cost, village.id);
    db.prepare('UPDATE village_plots SET building_type = ? WHERE id = ?').run(definition.type, plot.id);
  });
  tx();

  return { success: true, building: definition };
}

export function splitTithe(totalAmount: number, tithePercent: number): { personalAmount: number; titheAmount: number } {
  const titheAmount = Math.floor((totalAmount * tithePercent) / 100);
  return { personalAmount: totalAmount - titheAmount, titheAmount };
}

export interface GoldEarningsResult {
  personalAmount: number;
  titheAmount: number;
  village?: VillageRow;
}

/** Credits gold earned by a character, redirecting a tithe cut to their village's treasury if they're a member. */
export function applyGoldEarnings(characterId: number, totalAmount: number): GoldEarningsResult {
  const village = findVillageByCharacterMembership(characterId);
  if (!village) {
    return { personalAmount: totalAmount, titheAmount: 0 };
  }

  const { personalAmount, titheAmount } = splitTithe(totalAmount, village.tithe_percent);
  if (titheAmount > 0) {
    db.prepare('UPDATE villages SET gold = gold + ? WHERE id = ?').run(titheAmount, village.id);
  }

  return { personalAmount, titheAmount, village };
}
