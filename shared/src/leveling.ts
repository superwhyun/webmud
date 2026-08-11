const EXP_CURVE_BASE = 25;

/** 해당 레벨에 도달하기 위해 필요한 누적 경험치. */
export function expThresholdForLevel(level: number): number {
  return EXP_CURVE_BASE * level * (level - 1);
}
