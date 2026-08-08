const TARGET_KILLS_PER_LEVEL = 15;
const BASE_EXP_PER_LEVEL = 50 / TARGET_KILLS_PER_LEVEL;

const HP_WEIGHT = 0.5;
const ATK_WEIGHT = 1;
const DEF_WEIGHT = 2;

const REF_POWER_BASE = 10;
const REF_POWER_GROWTH = 8;

const MIN_POWER_RATIO = 0.6;
const MAX_POWER_RATIO = 1.8;

export interface MobCombatProfile {
  level: number;
  maxHp: number;
  strength: number;
  physicalDefense: number;
  magicDefense: number;
}

/** 해당 레벨의 "평균적인" 몹이 가져야 할 전투력 기준선. */
function referencePower(level: number): number {
  return REF_POWER_BASE + REF_POWER_GROWTH * (level - 1);
}

/**
 * 레벨 기준선(경험치 곡선의 레벨당 증가폭에서 역산)에 상대 난이도 배율을 곱해 산출한다.
 * 배율은 몹의 hp/공격력/방어력이 같은 레벨 평균보다 높낮은 정도이며, 0.6~1.8로 clamp해
 * 극단적인 스탯 조합 하나가 레벨업 페이스 전체를 흔들지 않게 한다.
 */
export function computeMobExpReward(mob: MobCombatProfile): number {
  const power =
    mob.maxHp * HP_WEIGHT + mob.strength * ATK_WEIGHT + (mob.physicalDefense + mob.magicDefense) * DEF_WEIGHT;
  const powerRatio = Math.min(MAX_POWER_RATIO, Math.max(MIN_POWER_RATIO, power / referencePower(mob.level)));
  return Math.round(BASE_EXP_PER_LEVEL * mob.level * powerRatio);
}
