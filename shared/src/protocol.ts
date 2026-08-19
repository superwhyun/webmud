import type { ElementType } from './elements.js';
import type { EquipmentSlot } from './equipment.js';
import type { ItemGrade } from './itemGrades.js';
import type { JobType, StatKey } from './jobs.js';
import type { NpcType } from './npc.js';

export interface CharacterState {
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  exp: number;
  roomName: string;
  job: JobType | null;
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  wisdom: number;
  luck: number;
  attackPower: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
  gold: number;
  unallocatedStatPoints: number;
  unallocatedSkillPoints: number;
}

export interface RoomExitInfo {
  direction: string;
  label: string;
  blocked: boolean;
}

export interface RoomItemInfo {
  name: string;
  quantity: number;
  grade: ItemGrade;
}

export interface RoomMobInfo {
  name: string;
  hp: number;
  maxHp: number;
  level: number;
  element: ElementType;
}

export interface RoomNpcInfo {
  name: string;
  type: NpcType;
  /** 상인일 때만 채워지는 판매 품목 이름 목록 — buy 탭 완성에 쓴다. */
  shopItemNames: string[];
}

export interface CombatMobInfo {
  spawnId: number;
  name: string;
  hp: number;
  maxHp: number;
  element: ElementType;
}

export interface VillagePlotInfo {
  index: number;
  buildingType: string | null;
  buildingName: string | null;
}

export interface VillageInfo {
  name: string;
  lordName: string;
  level: number;
  gold: number;
  wood: number;
  ore: number;
  food: number;
  tithePercent: number;
  raidProtectedUntil: string | null;
  plots: VillagePlotInfo[];
}

export interface RoomSnapshot {
  id: number;
  name: string;
  description: string;
  zoneId: number;
  zoneName: string;
  exits: RoomExitInfo[];
  items: RoomItemInfo[];
  mobs: RoomMobInfo[];
  npcs: RoomNpcInfo[];
  players: string[];
  village?: VillageInfo;
}

export interface InventoryItemInfo {
  inventoryId: number;
  name: string;
  quantity: number;
  equipped: boolean;
  slot: EquipmentSlot | null;
  grade: ItemGrade;
  level: number;
  healAmount: number;
  manaAmount: number;
  strengthBonus: number;
  dexterityBonus: number;
  intelligenceBonus: number;
  physicalDefenseBonus: number;
  magicDefenseBonus: number;
  attackPowerBonus: number;
  /** 상점 판매가 — 분해(salvage) 시 이 값의 1/10을 돌려받는다. */
  value: number;
}

export type EquipmentSnapshot = Partial<Record<EquipmentSlot, InventoryItemInfo>>;

export interface SkillCooldownInfo {
  skillId: string;
  name: string;
  remainingMs: number;
  totalMs: number;
}

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'command'; text: string }
  | { type: 'equipItem'; inventoryId: number }
  | { type: 'unequipItem'; slot: EquipmentSlot }
  | { type: 'dropItem'; inventoryId: number }
  | { type: 'useItem'; inventoryId: number }
  | { type: 'salvageItem'; inventoryId: number }
  | { type: 'reorderInventory'; inventoryIds: number[] }
  | { type: 'learnSkill'; skillId: string }
  | { type: 'upgradeSkill'; skillId: string }
  | { type: 'resetSkills' }
  | { type: 'allocateStat'; statKey: StatKey; amount: number }
  | { type: 'chooseJob'; job: JobType };

export type ChatChannel =
  | 'say'
  | 'shout'
  | 'tell'
  | 'admin'
  | 'death'
  | 'combat-victory'
  | 'combat-hit'
  | 'combat-hurt'
  | 'combat-evade'
  | 'combat-engage'
  | 'shop';

export type ServerMessage =
  | { type: 'text'; text: string; channel?: ChatChannel }
  | { type: 'state'; character: CharacterState }
  | { type: 'room'; room: RoomSnapshot }
  | { type: 'error'; text: string }
  | { type: 'combat'; mobs: CombatMobInfo[] }
  | { type: 'combatEnd' }
  | { type: 'equipment'; slots: EquipmentSnapshot }
  | { type: 'inventory'; items: InventoryItemInfo[] }
  | { type: 'needsJob' }
  | { type: 'skills'; learnedSkillIds: string[]; learnedSkillRanks: Record<string, number> }
  | { type: 'skillCooldowns'; cooldowns: SkillCooldownInfo[] }
  | { type: 'death'; roomId: number };
