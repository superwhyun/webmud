import type { ElementType } from '@mud/shared';
import { apiRequest, authHeader } from './api';

export interface AccountDto {
  id: number;
  username: string;
  isBuilder: boolean;
  isAdmin: boolean;
}

export interface SessionDto {
  characterName: string;
  roomId: number;
  roomName: string;
}

export interface RoomOptionDto {
  id: number;
  name: string;
}

export interface ItemTemplateDto {
  id: number;
  name: string;
  description: string;
  type: string;
  strengthBonus: number;
  dexterityBonus: number;
  physicalDefenseBonus: number;
  magicDefenseBonus: number;
  healAmount: number;
  value: number;
}

export interface RoomItemDto {
  id: number;
  roomId: number;
  roomName: string;
  itemId: number;
  itemName: string;
  quantity: number;
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

export interface MobSpawnDto {
  id: number;
  roomId: number;
  roomName: string;
  mobTemplateId: number;
  mobName: string;
  respawnSeconds: number;
}

export function fetchAccounts(token: string): Promise<{ accounts: AccountDto[] }> {
  return apiRequest('/admin/accounts', { headers: authHeader(token) });
}

export function updateAccount(
  token: string,
  id: number,
  patch: { isBuilder?: boolean; isAdmin?: boolean },
): Promise<{ account: AccountDto }> {
  return apiRequest(`/admin/accounts/${id}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(patch),
  });
}

export function fetchSessions(token: string): Promise<{ sessions: SessionDto[] }> {
  return apiRequest('/admin/sessions', { headers: authHeader(token) });
}

export function moderationMove(token: string, characterName: string, targetRoomId: number): Promise<void> {
  return apiRequest('/admin/moderation/move', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ characterName, targetRoomId }),
  });
}

export function moderationKick(token: string, characterName: string, reason?: string): Promise<void> {
  return apiRequest('/admin/moderation/kick', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ characterName, reason }),
  });
}

export function sendAnnouncement(token: string, message: string): Promise<void> {
  return apiRequest('/admin/announce', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ message }),
  });
}

export function fetchAdminRooms(token: string): Promise<{ rooms: RoomOptionDto[] }> {
  return apiRequest('/admin/rooms', { headers: authHeader(token) });
}

export function fetchItemTemplates(token: string): Promise<{ items: ItemTemplateDto[] }> {
  return apiRequest('/admin/items', { headers: authHeader(token) });
}

export function createItemTemplate(
  token: string,
  data: Omit<ItemTemplateDto, 'id'>,
): Promise<{ item: ItemTemplateDto }> {
  return apiRequest('/admin/items', { method: 'POST', headers: authHeader(token), body: JSON.stringify(data) });
}

export function fetchRoomItems(token: string): Promise<{ roomItems: RoomItemDto[] }> {
  return apiRequest('/admin/room-items', { headers: authHeader(token) });
}

export function placeRoomItem(token: string, roomId: number, itemId: number, quantity: number): Promise<void> {
  return apiRequest('/admin/room-items', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ roomId, itemId, quantity }),
  });
}

export function removeRoomItem(token: string, roomItemId: number): Promise<void> {
  return apiRequest('/admin/room-items', {
    method: 'DELETE',
    headers: authHeader(token),
    body: JSON.stringify({ roomItemId }),
  });
}

export function fetchMobTemplates(token: string): Promise<{ mobTemplates: MobTemplateDto[] }> {
  return apiRequest('/admin/mob-templates', { headers: authHeader(token) });
}

export function createMobTemplate(
  token: string,
  data: Omit<MobTemplateDto, 'id'>,
): Promise<{ mobTemplate: MobTemplateDto }> {
  return apiRequest('/admin/mob-templates', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export function fetchMobSpawns(token: string): Promise<{ mobSpawns: MobSpawnDto[] }> {
  return apiRequest('/admin/mob-spawns', { headers: authHeader(token) });
}

export function placeMobSpawn(
  token: string,
  roomId: number,
  mobTemplateId: number,
  respawnSeconds: number,
): Promise<{ spawnId: number }> {
  return apiRequest('/admin/mob-spawns', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ roomId, mobTemplateId, respawnSeconds }),
  });
}

export function removeMobSpawn(token: string, spawnId: number): Promise<void> {
  return apiRequest(`/admin/mob-spawns/${spawnId}`, { method: 'DELETE', headers: authHeader(token) });
}
