import type { ElementType, ItemGrade, NpcDealType, NpcType } from '@mud/shared';
import { apiRequest, authHeader } from './api';

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
}

export interface RoomOptionAllZonesDto {
  id: number;
  name: string;
  zoneId: number;
  zoneName: string;
}

export interface ItemTemplateDto {
  id: number;
  name: string;
  description: string;
  type: string;
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
  strength: number;
  dexterity: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
  damageType: 'physical' | 'magic';
  expReward: number;
  goldReward: number;
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
  mobTemplateId: number;
  mobName: string;
  respawnSeconds: number;
}

export interface NpcTemplateDto {
  id: number;
  name: string;
  description: string;
  type: NpcType;
  level: number;
  dealType: NpcDealType;
}

export interface NpcSpawnDto {
  id: number;
  roomId: number;
  roomName: string;
  npcTemplateId: number;
  npcName: string;
}

export function fetchBuilderRooms(token: string, zoneId: number): Promise<{ rooms: BuilderRoomDto[] }> {
  return apiRequest(`/builder/rooms?zoneId=${zoneId}`, { headers: authHeader(token) });
}

export function fetchAllRoomOptions(token: string): Promise<{ rooms: RoomOptionAllZonesDto[] }> {
  return apiRequest('/builder/rooms/all', { headers: authHeader(token) });
}

export function createBuilderRoom(
  token: string,
  name: string,
  description: string,
  x: number,
  y: number,
  zoneId: number,
): Promise<{ room: BuilderRoomDto }> {
  return apiRequest('/builder/rooms', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ name, description, x, y, zoneId }),
  });
}

export function fetchZones(token: string): Promise<{ zones: ZoneDto[] }> {
  return apiRequest('/builder/zones', { headers: authHeader(token) });
}

export function createZone(token: string, name: string, description: string): Promise<{ zone: ZoneDto }> {
  return apiRequest('/builder/zones', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ name, description }),
  });
}

export function addRoomExit(
  token: string,
  roomId: number,
  label: string,
  targetRoomId: number,
  returnLabel?: string,
): Promise<void> {
  return apiRequest('/builder/exits', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ roomId, label, targetRoomId, returnLabel: returnLabel || undefined }),
  });
}

export function removeRoomExit(token: string, roomId: number, direction: string): Promise<void> {
  return apiRequest(`/builder/exits/${roomId}/${encodeURIComponent(direction)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export function updateBuilderRoom(
  token: string,
  id: number,
  patch: { name?: string; description?: string; x?: number; y?: number },
): Promise<{ room: { id: number; name: string; description: string; x: number; y: number } }> {
  return apiRequest(`/builder/rooms/${id}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(patch),
  });
}

export function deleteBuilderRoom(token: string, id: number): Promise<void> {
  return apiRequest(`/builder/rooms/${id}`, { method: 'DELETE', headers: authHeader(token) });
}

export function setExitBlocked(
  token: string,
  roomId: number,
  direction: string,
  blocked: boolean,
): Promise<{ roomId: number; direction: string; blocked: boolean }> {
  return apiRequest('/builder/exits/block', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ roomId, direction, blocked }),
  });
}

export function fetchBuilderItemTemplates(token: string): Promise<{ items: ItemTemplateDto[] }> {
  return apiRequest('/builder/item-templates', { headers: authHeader(token) });
}

export function fetchBuilderMobTemplates(token: string): Promise<{ mobTemplates: MobTemplateDto[] }> {
  return apiRequest('/builder/mob-templates', { headers: authHeader(token) });
}

export function fetchBuilderRoomItems(token: string): Promise<{ roomItems: RoomItemDto[] }> {
  return apiRequest('/builder/room-items', { headers: authHeader(token) });
}

export function placeBuilderRoomItem(token: string, roomId: number, itemId: number, quantity: number): Promise<void> {
  return apiRequest('/builder/room-items', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ roomId, itemId, quantity }),
  });
}

export function removeBuilderRoomItem(token: string, roomItemId: number): Promise<void> {
  return apiRequest('/builder/room-items', {
    method: 'DELETE',
    headers: authHeader(token),
    body: JSON.stringify({ roomItemId }),
  });
}

export function fetchBuilderMobSpawns(token: string): Promise<{ mobSpawns: MobSpawnDto[] }> {
  return apiRequest('/builder/mob-spawns', { headers: authHeader(token) });
}

export function placeBuilderMobSpawn(
  token: string,
  roomId: number,
  mobTemplateId: number,
  respawnSeconds: number,
): Promise<{ spawnId: number }> {
  return apiRequest('/builder/mob-spawns', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ roomId, mobTemplateId, respawnSeconds }),
  });
}

export function removeBuilderMobSpawn(token: string, spawnId: number): Promise<void> {
  return apiRequest(`/builder/mob-spawns/${spawnId}`, { method: 'DELETE', headers: authHeader(token) });
}

export function fetchBuilderNpcTemplates(token: string): Promise<{ npcTemplates: NpcTemplateDto[] }> {
  return apiRequest('/builder/npc-templates', { headers: authHeader(token) });
}

export function fetchBuilderNpcSpawns(token: string): Promise<{ npcSpawns: NpcSpawnDto[] }> {
  return apiRequest('/builder/npc-spawns', { headers: authHeader(token) });
}

export function placeBuilderNpcSpawn(token: string, roomId: number, npcTemplateId: number): Promise<{ spawnId: number }> {
  return apiRequest('/builder/npc-spawns', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ roomId, npcTemplateId }),
  });
}

export function removeBuilderNpcSpawn(token: string, spawnId: number): Promise<void> {
  return apiRequest(`/builder/npc-spawns/${spawnId}`, { method: 'DELETE', headers: authHeader(token) });
}
