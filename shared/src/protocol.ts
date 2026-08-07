import type { ElementType } from './elements.js';

export interface CharacterState {
  name: string;
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  roomName: string;
  strength: number;
  dexterity: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
  gold: number;
}

export interface RoomExitInfo {
  direction: string;
  label: string;
}

export interface RoomItemInfo {
  name: string;
  quantity: number;
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

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'command'; text: string };

export type ChatChannel = 'say' | 'shout';

export type ServerMessage =
  | { type: 'text'; text: string; channel?: ChatChannel }
  | { type: 'state'; character: CharacterState }
  | { type: 'room'; room: RoomSnapshot }
  | { type: 'error'; text: string }
  | { type: 'combat'; mobName: string; mobHp: number; mobMaxHp: number }
  | { type: 'combatEnd' };
