import type { ElementType } from '@mud/shared';

export interface CharacterRow {
  id: number;
  account_id: number;
  name: string;
  room_id: number;
  hp: number;
  max_hp: number;
  level: number;
  exp: number;
  strength: number;
  dexterity: number;
  physical_defense: number;
  magic_defense: number;
  element: ElementType;
  gold: number;
  created_at: string;
}

export interface CharacterWithRoomRow extends CharacterRow {
  room_name: string;
}

export interface ItemRow {
  id: number;
  name: string;
  description: string;
  type: string;
  strength_bonus: number;
  dexterity_bonus: number;
  physical_defense_bonus: number;
  magic_defense_bonus: number;
  heal_amount: number;
  value: number;
}
