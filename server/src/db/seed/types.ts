import type { ElementType, EquipmentSlot, ItemGrade, NpcDealType, NpcType } from '@mud/shared';

export interface RoomSeed {
  id: number;
  name: string;
  description: string;
}

export interface ExitSeed {
  roomId: number;
  direction: string;
  targetRoomId: number;
}

export interface ItemSeed {
  id: number;
  name: string;
  description: string;
  type: 'weapon' | 'armor' | 'consumable';
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

export interface RoomItemSeed {
  roomId: number;
  itemId: number;
  quantity: number;
}

export interface MobTemplateSeed {
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
}

export interface MobSpawnSeed {
  roomId: number;
  mobTemplateId: number;
  respawnSeconds: number;
}

export interface MobLootPoolSeed {
  mobTemplateId: number;
  itemId: number;
  weight: number;
}

export interface NpcTemplateSeed {
  id: number;
  name: string;
  description: string;
  type: NpcType;
  dealType: NpcDealType;
}

export interface NpcSpawnSeed {
  roomId: number;
  npcTemplateId: number;
}
