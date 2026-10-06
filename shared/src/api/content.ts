import type { ElementType } from '../elements.js';
import type { EquipmentSlot } from '../equipment.js';
import type { ItemGrade } from '../itemGrades.js';
import type { NpcDealType, NpcType } from '../npc.js';

export interface ItemTemplateDto {
  id: number;
  name: string;
  description: string;
  type: string;
  slot: EquipmentSlot | null;
  level: number;
  grade: ItemGrade;
  strengthBonus: number;
  dexterityBonus: number;
  attackPowerBonus: number;
  intelligenceBonus: number;
  physicalDefenseBonus: number;
  magicDefenseBonus: number;
  healAmount: number;
  manaAmount: number;
  value: number;
}

export interface MobTemplateDto {
  id: number;
  name: string;
  hp: number;
  hpMax: number;
  strength: number;
  strengthMax: number;
  dexterity: number;
  dexterityMax: number;
  physicalDefense: number;
  physicalDefenseMax: number;
  magicDefense: number;
  magicDefenseMax: number;
  element: ElementType;
  damageType: 'physical' | 'magic';
  expReward: number;
  expRewardMax: number;
  goldReward: number;
  goldRewardMax: number;
  minLevel: number;
  maxLevel: number;
  hostile: boolean;
  isBoss: boolean;
}

export interface NpcTemplateDto {
  id: number;
  name: string;
  description: string;
  type: NpcType;
  dealType: NpcDealType;
}

export interface MobLootPoolItemDto extends ItemTemplateDto {
  weight: number;
}

export interface MobLootPoolEntryDto extends MobLootPoolItemDto {
  mobTemplateId: number;
}

export interface ContentExportDto {
  exportedAt: string;
  items: ItemTemplateDto[];
  mobTemplates: MobTemplateDto[];
  mobLootPool: { mobTemplateId: number; itemId: number; weight: number }[];
}
