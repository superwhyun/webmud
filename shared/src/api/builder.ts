import type { ItemGrade } from '../itemGrades.js';

export interface BuilderExitDto {
  direction: string;
  targetRoomId: number;
  blocked: boolean;
}

export interface BuilderRoomDto {
  id: number;
  name: string;
  description: string;
  x: number;
  y: number;
  zoneId: number;
  exits: BuilderExitDto[];
}

export interface ZoneDto {
  id: number;
  name: string;
  description: string;
  minLevel: number | null;
  maxLevel: number | null;
}

export interface RoomItemDto {
  id: number;
  roomId: number;
  roomName: string;
  itemId: number;
  itemName: string;
  itemGrade: ItemGrade;
  quantity: number;
}

export interface MobSpawnDto {
  id: number;
  roomId: number;
  roomName: string;
  zoneId: number;
  mobTemplateId: number;
  mobName: string;
  mobMinLevel: number;
  mobMaxLevel: number;
  /** 이 스폰에만 적용되는 굴림 레벨 범위. null이면 템플릿 전체 범위(mobMinLevel~mobMaxLevel) 그대로 굴러간다. */
  overrideMinLevel: number | null;
  overrideMaxLevel: number | null;
  respawnSeconds: number;
  isBoss: boolean;
}

export interface NpcSpawnDto {
  id: number;
  roomId: number;
  roomName: string;
  npcTemplateId: number;
  npcName: string;
}

export interface AddRoomOperation {
  type: 'add_room';
  tempId: string;
  name: string;
  description: string;
  x: number;
  y: number;
}

export interface AddMobSpawnOperation {
  type: 'add_mob_spawn';
  roomRef: string;
  roomLabel: string;
  mobTemplateId: number;
  mobName: string;
  respawnSeconds: number;
}

export interface AddRoomItemOperation {
  type: 'add_room_item';
  roomRef: string;
  roomLabel: string;
  itemId: number;
  itemName: string;
  quantity: number;
}

export interface AddNpcSpawnOperation {
  type: 'add_npc_spawn';
  roomRef: string;
  roomLabel: string;
  npcTemplateId: number;
  npcName: string;
}

export type MapAssistantOperation = AddRoomOperation | AddMobSpawnOperation | AddRoomItemOperation | AddNpcSpawnOperation;

export interface MapAssistantProposeResult {
  operations: MapAssistantOperation[];
  summary: string;
}

export interface MapAssistantApplyResult {
  results: { operation: MapAssistantOperation; success: boolean; error?: string }[];
}

export interface MapExportPayload {
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export type { RoomOptionDto as RoomOptionAllZonesDto } from './admin.js';
