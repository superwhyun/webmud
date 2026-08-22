import { criticalChanceForLuck, ELEMENT_ADVANTAGE, type ElementType } from '@mud/shared';
import type { DamageType, MobInstance } from '../MobManager.js';

const DAMAGE_VARIANCE = 1;
const MIN_DAMAGE = 1;
const BASE_EVASION = 0.05;
const EVASION_PER_DEX = 0.02;
const MAX_EVASION = 0.35;
const ELEMENT_ADVANTAGE_MULTIPLIER = 1.3;
const ELEMENT_DISADVANTAGE_MULTIPLIER = 0.7;

const CRIT_DAMAGE_MULTIPLIER = 1.5;

export interface CombatantStats {
  strength: number;
  dexterity: number;
  attackPower: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
  /** 없으면(몹) 치명타 확률은 기본값만 적용된다. */
  luck?: number;
  /** 없으면(몹) magic 공격이라도 strength를 그대로 쓴다 — 몹은 damageType으로 방어 스탯만 갈릴 뿐 공격 자원은 항상 strength 하나다. */
  intelligence?: number;
}

export interface AttackResult {
  damage: number;
  evaded: boolean;
  isCrit: boolean;
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
}

/** attackerElement가 defenderElement에 상성 우위(오행 상극)를 가지는지. */
export function hasElementAdvantage(attackerElement: ElementType, defenderElement: ElementType): boolean {
  return ELEMENT_ADVANTAGE[attackerElement] === defenderElement;
}

function getElementMultiplier(attackerElement: ElementType, defenderElement: ElementType): number {
  if (hasElementAdvantage(attackerElement, defenderElement)) return ELEMENT_ADVANTAGE_MULTIPLIER;
  if (hasElementAdvantage(defenderElement, attackerElement)) return ELEMENT_DISADVANTAGE_MULTIPLIER;
  return 1;
}

export function computeDamage(
  attackStat: number,
  defense: number,
  attackerElement: ElementType,
  defenderElement: ElementType,
  powerMultiplier: number,
  attackerLuck = 0,
): DamageResult {
  const elementMultiplier = getElementMultiplier(attackerElement, defenderElement);
  const critChance = criticalChanceForLuck(attackerLuck);
  const isCrit = Math.random() < critChance;
  const effectiveMultiplier = isCrit ? powerMultiplier * CRIT_DAMAGE_MULTIPLIER : powerMultiplier;

  const variance = Math.floor(Math.random() * (DAMAGE_VARIANCE * 2 + 1)) - DAMAGE_VARIANCE;
  const rawDamage = Math.round((attackStat * effectiveMultiplier - defense) * elementMultiplier) + variance;
  return { damage: Math.max(MIN_DAMAGE, rawDamage), isCrit };
}

/**
 * attackStatOverride를 넘기면 그 값을 그대로 위력 스탯으로 쓴다 — 직업별로 실제 성장시키는
 * 스탯(예: 도적=민첩, 사제=지혜)이 힘/지능과 다를 수 있어서, 어떤 스탯을 쓸지는 job을 아는
 * 호출부(combatState.ts)에서 미리 계산해 넘긴다. 안 넘기면(몹 공격, 습격전 등 기존 호출부)
 * 예전과 똑같이 물리=힘, 마법=지능(있으면)으로 계산해 하위 호환을 유지한다.
 */
export function resolveAttack(
  attacker: CombatantStats,
  defender: CombatantStats,
  damageType: DamageType,
  attackStatOverride?: number,
): AttackResult {
  const evasionChance = Math.min(
    MAX_EVASION,
    Math.max(0, BASE_EVASION + (defender.dexterity - attacker.dexterity) * EVASION_PER_DEX),
  );
  if (Math.random() < evasionChance) {
    return { damage: 0, evaded: true, isCrit: false };
  }

  const defense = damageType === 'magic' ? defender.magicDefense : defender.physicalDefense;
  const attackStat =
    attackStatOverride !== undefined
      ? attackStatOverride
      : damageType === 'magic' && attacker.intelligence !== undefined
        ? attacker.intelligence
        : attacker.strength + attacker.attackPower;
  const { damage, isCrit } = computeDamage(attackStat, defense, attacker.element, defender.element, 1, attacker.luck);

  return { damage, evaded: false, isCrit };
}

export function mobCombatantStats(mob: MobInstance): CombatantStats {
  return {
    strength: mob.strength,
    dexterity: mob.dexterity,
    attackPower: 0,
    physicalDefense: mob.physicalDefense,
    magicDefense: mob.magicDefense,
    element: mob.element,
  };
}
