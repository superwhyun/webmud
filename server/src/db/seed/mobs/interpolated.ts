import { suffixForLevel, type ElementType } from '@mud/shared';
import type { MobTemplateSeed } from '../types.js';
import { MOB_TEMPLATES_TIER1 } from './tier1.js';
import { MOB_TEMPLATES_TIER2 } from './tier2.js';
import { MOB_TEMPLATES_TIER3 } from './tier3.js';

/** 덩굴괴수/불도마뱀/바위골렘/강철전갈/늪지악어 — 각 존에서 쓰는 5종, 이 순서가 speciesIndex(0~4)와 대응한다. */
export const SPECIES_NAMES = ['덩굴괴수', '불도마뱀', '바위골렘', '강철전갈', '늪지악어'] as const;

/** 기존에 손으로 만든 스탯이 존재하는 레벨(앵커). 그 사이는 매 스폰마다 즉석에서 보간한다. */
const ANCHOR_LEVELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

const ANCHOR_TEMPLATES: MobTemplateSeed[] = [...MOB_TEMPLATES_TIER1, ...MOB_TEMPLATES_TIER2, ...MOB_TEMPLATES_TIER3];

function findAnchor(name: string, level: number): MobTemplateSeed {
  const found = ANCHOR_TEMPLATES.find((template) => template.name === name && template.level === level);
  if (!found) throw new Error(`앵커 몹 템플릿을 찾을 수 없습니다: ${name} Lv${level}`);
  return found;
}

function interpolateStat(lower: number, upper: number, ratio: number): number {
  return Math.round(lower + (upper - lower) * ratio);
}

function nearestAnchorLevel(level: number): number {
  return ANCHOR_LEVELS.reduce((closest, anchor) => (Math.abs(anchor - level) < Math.abs(closest - level) ? anchor : closest));
}

export interface ComputedMobStats {
  /** 루팅 풀 조회용 — 가장 가까운 앵커 템플릿 id. */
  lootTemplateId: number;
  name: string;
  hp: number;
  strength: number;
  dexterity: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
  damageType: 'physical' | 'magic';
  expReward: number;
  goldReward: number;
  level: number;
}

/** speciesIndex(0~4)와 임의의 레벨(1~50)에 대해, 인접한 두 앵커 사이를 보간해 실제 스탯을 즉석에서 계산한다. */
export function computeMobStatsForLevel(speciesIndex: number, level: number): ComputedMobStats {
  const name = SPECIES_NAMES[speciesIndex];
  const clampedLevel = Math.min(50, Math.max(1, Math.round(level)));
  const displayName = `${name}${suffixForLevel(clampedLevel)}`;
  const lootTemplateId = findAnchor(name, nearestAnchorLevel(clampedLevel)).id;

  if (ANCHOR_LEVELS.includes(clampedLevel)) {
    const anchor = findAnchor(name, clampedLevel);
    return {
      lootTemplateId,
      name: displayName,
      hp: anchor.hp,
      strength: anchor.strength,
      dexterity: anchor.dexterity,
      physicalDefense: anchor.physicalDefense,
      magicDefense: anchor.magicDefense,
      element: anchor.element,
      damageType: anchor.damageType,
      expReward: anchor.expReward,
      goldReward: anchor.goldReward,
      level: clampedLevel,
    };
  }

  let lowerLevel = ANCHOR_LEVELS[0];
  let upperLevel = ANCHOR_LEVELS[ANCHOR_LEVELS.length - 1];
  for (let i = 0; i < ANCHOR_LEVELS.length - 1; i += 1) {
    if (ANCHOR_LEVELS[i] < clampedLevel && clampedLevel < ANCHOR_LEVELS[i + 1]) {
      lowerLevel = ANCHOR_LEVELS[i];
      upperLevel = ANCHOR_LEVELS[i + 1];
      break;
    }
  }
  const lowerAnchor = findAnchor(name, lowerLevel);
  const upperAnchor = findAnchor(name, upperLevel);
  const ratio = (clampedLevel - lowerLevel) / (upperLevel - lowerLevel);

  return {
    lootTemplateId,
    name: displayName,
    hp: interpolateStat(lowerAnchor.hp, upperAnchor.hp, ratio),
    strength: interpolateStat(lowerAnchor.strength, upperAnchor.strength, ratio),
    dexterity: interpolateStat(lowerAnchor.dexterity, upperAnchor.dexterity, ratio),
    physicalDefense: interpolateStat(lowerAnchor.physicalDefense, upperAnchor.physicalDefense, ratio),
    magicDefense: interpolateStat(lowerAnchor.magicDefense, upperAnchor.magicDefense, ratio),
    element: lowerAnchor.element,
    damageType: lowerAnchor.damageType,
    expReward: interpolateStat(lowerAnchor.expReward, upperAnchor.expReward, ratio),
    goldReward: interpolateStat(lowerAnchor.goldReward, upperAnchor.goldReward, ratio),
    level: clampedLevel,
  };
}

/** 이 종을 대표하는 안정적인 mob_templates id (레벨1 앵커) — mob_spawns.mob_template_id로 저장해 종을 식별한다. */
export function speciesAnchorId(speciesIndex: number): number {
  return findAnchor(SPECIES_NAMES[speciesIndex], 1).id;
}

const SPECIES_ANCHOR_IDS = SPECIES_NAMES.map((_, index) => speciesAnchorId(index));

/** templateId(=speciesAnchorId로 저장된 레벨1 앵커 id)로부터 종 인덱스를 역으로 찾는다 — 리스폰 시 이름에 +가 붙어 있어도 종을 식별할 수 있게. */
export function speciesIndexForAnchorId(anchorId: number): number {
  return SPECIES_ANCHOR_IDS.indexOf(anchorId);
}

export function randomLevelInRange(minLevel: number, maxLevel: number): number {
  return minLevel + Math.floor(Math.random() * (maxLevel - minLevel + 1));
}

interface SpeciesSelectionOptions {
  excludeSpeciesNames?: Set<string>;
  count?: number;
}

/** 중복 없이 무작위로 종을 고른다 — 실제 레벨/스탯은 스폰 시점에 computeMobStatsForLevel로 각각 계산한다. */
export function randomSpeciesSelection(options: SpeciesSelectionOptions = {}): number[] {
  const excludeSpeciesNames = options.excludeSpeciesNames ?? new Set<string>();
  const available = SPECIES_NAMES.map((name, index) => ({ name, index })).filter(
    (species) => !excludeSpeciesNames.has(species.name),
  );
  if (available.length === 0) return [];

  const count = Math.min(available.length, options.count ?? 1 + Math.floor(Math.random() * available.length));
  const shuffled = [...available].sort(() => Math.random() - 0.5).slice(0, count);
  return shuffled.map(({ index }) => index);
}
