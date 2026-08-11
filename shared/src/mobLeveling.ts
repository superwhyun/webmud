export const MOB_LEVEL_BRACKET_SIZE = 10;
export const MOB_LEVEL_BRACKET_MAX_INDEX = 4;
export const MAX_MOB_LEVEL = 50;

export interface MobLevelBracket {
  suffix: string;
  min: number;
  max: number;
}

/** 절대 레벨 1~50을 5단계로 나눠 이름에 붙일 접미사와 그 구간을 정한다: 1-10 없음, 11-20 +, 21-30 ++, 31-40 +++, 41-50 ++++. */
export function mobLevelBracket(level: number): MobLevelBracket {
  const bracketIndex = Math.min(MOB_LEVEL_BRACKET_MAX_INDEX, Math.floor((Math.max(1, level) - 1) / MOB_LEVEL_BRACKET_SIZE));
  return {
    suffix: '+'.repeat(bracketIndex),
    min: bracketIndex * MOB_LEVEL_BRACKET_SIZE + 1,
    max: Math.min(MAX_MOB_LEVEL, (bracketIndex + 1) * MOB_LEVEL_BRACKET_SIZE),
  };
}

export function suffixForLevel(level: number): string {
  return mobLevelBracket(level).suffix;
}
