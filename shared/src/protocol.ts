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

export interface RoomSnapshot {
  name: string;
  description: string;
  exits: RoomExitInfo[];
  items: RoomItemInfo[];
  mobs: RoomMobInfo[];
  players: string[];
}

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'command'; text: string };

export type ServerMessage =
  | { type: 'text'; text: string }
  | { type: 'state'; character: CharacterState }
  | { type: 'room'; room: RoomSnapshot }
  | { type: 'error'; text: string };
