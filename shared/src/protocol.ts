import type { ElementType } from './elements.js';
import type { EquipmentSlot } from './equipment.js';
import type { ItemGrade } from './itemGrades.js';
import type { JobType } from './jobs.js';

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
  exits: RoomExitInfo[];
  items: RoomItemInfo[];
  mobs: RoomMobInfo[];
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
}

export type EquipmentSnapshot = Partial<Record<EquipmentSlot, InventoryItemInfo>>;

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'command'; text: string }
  | { type: 'equipItem'; inventoryId: number }
  | { type: 'unequipItem'; slot: EquipmentSlot }
  | { type: 'chooseJob'; job: JobType };

export type ChatChannel = 'say' | 'shout' | 'admin';

export type ServerMessage =
  | { type: 'text'; text: string; channel?: ChatChannel }
  | { type: 'state'; character: CharacterState }
  | { type: 'room'; room: RoomSnapshot }
  | { type: 'error'; text: string }
  | { type: 'combat'; mobName: string; mobHp: number; mobMaxHp: number }
  | { type: 'combatEnd' }
  | { type: 'equipment'; slots: EquipmentSnapshot }
  | { type: 'inventory'; items: InventoryItemInfo[] }
  | { type: 'needsJob' }
  | { type: 'skills'; learnedSkillIds: string[] };
