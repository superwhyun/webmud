import type { ElementType, EquipmentSlot, ItemGrade } from '@mud/shared';
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
  level: number;
  hostile: boolean;
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

export function updateItemTemplate(
  token: string,
  id: number,
  data: Omit<ItemTemplateDto, 'id'>,
): Promise<{ item: ItemTemplateDto }> {
  return apiRequest(`/admin/items/${id}`, { method: 'PATCH', headers: authHeader(token), body: JSON.stringify(data) });
}

export function deleteItemTemplate(token: string, id: number): Promise<void> {
  return apiRequest(`/admin/items/${id}`, { method: 'DELETE', headers: authHeader(token) });
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

export function updateMobTemplate(
  token: string,
  id: number,
  data: Omit<MobTemplateDto, 'id'>,
): Promise<{ mobTemplate: MobTemplateDto }> {
  return apiRequest(`/admin/mob-templates/${id}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export function deleteMobTemplate(token: string, id: number): Promise<void> {
  return apiRequest(`/admin/mob-templates/${id}`, { method: 'DELETE', headers: authHeader(token) });
}

export interface MobLootPoolItemDto extends ItemTemplateDto {
  weight: number;
}

export function fetchMobLootPool(token: string, mobTemplateId: number): Promise<{ items: MobLootPoolItemDto[] }> {
  return apiRequest(`/admin/mob-templates/${mobTemplateId}/loot-pool`, { headers: authHeader(token) });
}

export function addMobLootPoolItem(
  token: string,
  mobTemplateId: number,
  itemId: number,
  weight?: number,
): Promise<{ items: MobLootPoolItemDto[] }> {
  return apiRequest(`/admin/mob-templates/${mobTemplateId}/loot-pool`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ itemId, weight }),
  });
}

export function removeMobLootPoolItem(token: string, mobTemplateId: number, itemId: number): Promise<void> {
  return apiRequest(`/admin/mob-templates/${mobTemplateId}/loot-pool/${itemId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export interface ContentExportDto {
  exportedAt: string;
  items: ItemTemplateDto[];
  mobTemplates: MobTemplateDto[];
  mobLootPool: { mobTemplateId: number; itemId: number; weight: number }[];
}

export function exportContent(token: string): Promise<ContentExportDto> {
  return apiRequest('/admin/content-export', { headers: authHeader(token) });
}

export function importContent(
  token: string,
  data: Omit<ContentExportDto, 'exportedAt'>,
): Promise<{ itemCount: number; mobTemplateCount: number; lootEntryCount: number }> {
  return apiRequest('/admin/content-import', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

