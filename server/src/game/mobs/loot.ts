const BOSS_LOOT_CHANCE_MULTIPLIER = 2;

export interface LootPoolEntry {
  item_id: number;
  weight: number;
}

/**
 * mob_loot_pool.weight는 이제 "기본 등장확률(%)"이고, 몹이 지금 굴린 레벨이 자기 템플릿의
 * min~max 구간에서 몇 번째냐(최소=1배, 최대=10배)에 따라 배수를 곱한 뒤 아이템마다 독립적으로
 * 굴린다 — 같은 풀 안에서 서로 배타적으로 하나만 뽑는 방식이 아니라, 여러 개가 동시에 나올 수 있다.
 */
function lootLevelMultiplier(level: number, minLevel: number, maxLevel: number): number {
  if (maxLevel <= minLevel) return 1;
  return Math.max(1, level - minLevel + 1);
}

/** Roll each pool entry independently; injectable randomness supports simulations. */
export function rollLootPool(
  pool: readonly LootPoolEntry[],
  level: number,
  minLevel: number,
  maxLevel: number,
  isBoss = false,
  random: () => number = Math.random,
): number[] {
  const multiplier = lootLevelMultiplier(level, minLevel, maxLevel);
  const bossMultiplier = isBoss ? BOSS_LOOT_CHANCE_MULTIPLIER : 1;
  const carried: number[] = [];
  for (const entry of pool) {
    const chancePercent = Math.min(100, entry.weight * multiplier * bossMultiplier);
    if (random() * 100 < chancePercent) carried.push(entry.item_id);
  }

  return carried;
}
