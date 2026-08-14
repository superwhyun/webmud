import { ELEMENT_ADVANTAGE, type ElementType } from '@mud/shared';
import type { DamageType, MobInstance } from '../MobManager.js';

const DAMAGE_VARIANCE = 1;
const MIN_DAMAGE = 1;
const BASE_EVASION = 0.05;
const EVASION_PER_DEX = 0.02;
const MAX_EVASION = 0.35;
const ELEMENT_ADVANTAGE_MULTIPLIER = 1.3;
const ELEMENT_DISADVANTAGE_MULTIPLIER = 0.7;

/** 회피율 공식과 같은 형태(기본값 + 스탯당 보너스, 상한 있음)로 맞춘 치명타 확률. */
const BASE_CRIT_CHANCE = 0.05;
const CRIT_CHANCE_PER_LUCK = 0.01;
const MAX_CRIT_CHANCE = 0.35;
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
  const critChance = Math.min(MAX_CRIT_CHANCE, BASE_CRIT_CHANCE + attackerLuck * CRIT_CHANCE_PER_LUCK);
  const isCrit = Math.random() < critChance;
  const effectiveMultiplier = isCrit ? powerMultiplier * CRIT_DAMAGE_MULTIPLIER : powerMultiplier;

  const variance = Math.floor(Math.random() * (DAMAGE_VARIANCE * 2 + 1)) - DAMAGE_VARIANCE;
  const rawDamage = Math.round((attackStat * effectiveMultiplier - defense) * elementMultiplier) + variance;
  return { damage: Math.max(MIN_DAMAGE, rawDamage), isCrit };
}

export function resolveAttack(attacker: CombatantStats, defender: CombatantStats, damageType: DamageType): AttackResult {
  const evasionChance = Math.min(
    MAX_EVASION,
    Math.max(0, BASE_EVASION + (defender.dexterity - attacker.dexterity) * EVASION_PER_DEX),
  );
  if (Math.random() < evasionChance) {
    return { damage: 0, evaded: true, isCrit: false };
  }

  const defense = damageType === 'magic' ? defender.magicDefense : defender.physicalDefense;
  const { damage, isCrit } = computeDamage(
    attacker.strength + attacker.attackPower,
    defense,
    attacker.element,
    defender.element,
    1,
    attacker.luck,
  );

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
