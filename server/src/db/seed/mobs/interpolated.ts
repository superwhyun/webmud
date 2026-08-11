import type { MobLootPoolSeed, MobTemplateSeed } from '../types.js';
import { MOB_TEMPLATES_TIER1 } from './tier1.js';
import { MOB_TEMPLATES_TIER2 } from './tier2.js';
import { MOB_TEMPLATES_TIER3 } from './tier3.js';
import { MOB_LOOT_POOL_BASE } from './lootPool.js';

/** 덩굴괴수/불도마뱀/바위골렘/강철전갈/늪지악어 — 각 존에서 쓰는 5종, 이 순서가 speciesIndex(0~4)와 대응한다. */
export const SPECIES_NAMES = ['덩굴괴수', '불도마뱀', '바위골렘', '강철전갈', '늪지악어'] as const;

/** 기존에 손으로 만든 스탯이 존재하는 레벨(앵커). 그 사이는 보간해서 채운다. */
const ANCHOR_LEVELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

const ANCHOR_TEMPLATES: MobTemplateSeed[] = [...MOB_TEMPLATES_TIER1, ...MOB_TEMPLATES_TIER2, ...MOB_TEMPLATES_TIER3];

const INTERPOLATED_ID_BASE = 1000;

function findAnchor(name: string, level: number): MobTemplateSeed {
  const found = ANCHOR_TEMPLATES.find((template) => template.name === name && template.level === level);
  if (!found) throw new Error(`앵커 몹 템플릿을 찾을 수 없습니다: ${name} Lv${level}`);
  return found;
}

function interpolateStat(lower: number, upper: number, ratio: number): number {
  return Math.round(lower + (upper - lower) * ratio);
}

function interpolatedId(speciesIndex: number, level: number): number {
  return INTERPOLATED_ID_BASE + level * 10 + speciesIndex;
}

/** 앵커 레벨이면 기존 id, 아니면 보간해서 새로 만든 id를 돌려준다. */
export function mobTemplateIdForLevel(speciesIndex: number, level: number): number {
  const name = SPECIES_NAMES[speciesIndex];
  if (ANCHOR_LEVELS.includes(level)) return findAnchor(name, level).id;
  return interpolatedId(speciesIndex, level);
}

function buildInterpolatedTemplates(): MobTemplateSeed[] {
  const templates: MobTemplateSeed[] = [];
  SPECIES_NAMES.forEach((name, speciesIndex) => {
    for (let i = 0; i < ANCHOR_LEVELS.length - 1; i += 1) {
      const lowerLevel = ANCHOR_LEVELS[i];
      const upperLevel = ANCHOR_LEVELS[i + 1];
      const lowerAnchor = findAnchor(name, lowerLevel);
      const upperAnchor = findAnchor(name, upperLevel);
      for (let level = lowerLevel + 1; level < upperLevel; level += 1) {
        const ratio = (level - lowerLevel) / (upperLevel - lowerLevel);
        templates.push({
          id: interpolatedId(speciesIndex, level),
          name,
          hp: interpolateStat(lowerAnchor.hp, upperAnchor.hp, ratio),
          strength: interpolateStat(lowerAnchor.strength, upperAnchor.strength, ratio),
          dexterity: interpolateStat(lowerAnchor.dexterity, upperAnchor.dexterity, ratio),
          physicalDefense: interpolateStat(lowerAnchor.physicalDefense, upperAnchor.physicalDefense, ratio),
          magicDefense: interpolateStat(lowerAnchor.magicDefense, upperAnchor.magicDefense, ratio),
          element: lowerAnchor.element,
          damageType: lowerAnchor.damageType,
          expReward: interpolateStat(lowerAnchor.expReward, upperAnchor.expReward, ratio),
          goldReward: interpolateStat(lowerAnchor.goldReward, upperAnchor.goldReward, ratio),
          level,
        });
      }
    }
  });
  return templates;
}

export const MOB_TEMPLATES_INTERPOLATED: MobTemplateSeed[] = buildInterpolatedTemplates();

/** 보간된 레벨의 몹도 드롭이 비어있지 않도록, 자신이 속한 구간의 상위 앵커가 쓰는 루팅 풀을 그대로 물려받는다. */
function buildInterpolatedLootPool(): MobLootPoolSeed[] {
  const entries: MobLootPoolSeed[] = [];
  SPECIES_NAMES.forEach((name, speciesIndex) => {
    for (let i = 0; i < ANCHOR_LEVELS.length - 1; i += 1) {
      const lowerLevel = ANCHOR_LEVELS[i];
      const upperLevel = ANCHOR_LEVELS[i + 1];
      const upperAnchor = findAnchor(name, upperLevel);
      const upperLoot = MOB_LOOT_POOL_BASE.filter((entry) => entry.mobTemplateId === upperAnchor.id);
      for (let level = lowerLevel + 1; level < upperLevel; level += 1) {
        const templateId = interpolatedId(speciesIndex, level);
        for (const loot of upperLoot) {
          entries.push({ mobTemplateId: templateId, itemId: loot.itemId, weight: loot.weight });
        }
      }
    }
  });
  return entries;
}

export const MOB_LOOT_POOL_INTERPOLATED: MobLootPoolSeed[] = buildInterpolatedLootPool();

interface MobSelectionOptions {
  excludeSpeciesNames?: Set<string>;
  count?: number;
}

/** minLevel~maxLevel 사이에서 종을 무작위로(중복 없이) 골라, 각각 무작위 레벨로 몹 템플릿 id를 만든다. */
export function randomMobSelection(minLevel: number, maxLevel: number, options: MobSelectionOptions = {}): number[] {
  const excludeSpeciesNames = options.excludeSpeciesNames ?? new Set<string>();
  const available = SPECIES_NAMES.map((name, index) => ({ name, index })).filter(
    (species) => !excludeSpeciesNames.has(species.name),
  );
  if (available.length === 0) return [];

  const count = Math.min(available.length, options.count ?? 1 + Math.floor(Math.random() * available.length));
  const shuffled = [...available].sort(() => Math.random() - 0.5).slice(0, count);

  return shuffled.map(({ index }) => {
    const level = minLevel + Math.floor(Math.random() * (maxLevel - minLevel + 1));
    return mobTemplateIdForLevel(index, level);
  });
}
