import type { ElementType } from '@mud/shared';

export type DamageType = 'physical' | 'magic';

export interface MobInstance {
  spawnId: number;
  templateId: number;
  roomId: number;
  homeRoomId: number;
  name: string;
  maxHp: number;
  hp: number;
  strength: number;
  dexterity: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
  damageType: DamageType;
  expReward: number;
  goldReward: number;
  respawnSeconds: number;
  level: number;
  hostile: boolean;
  isBoss: boolean;
  carriedItemIds: number[];
  alive: boolean;
  respawnAt: number | null;
}
