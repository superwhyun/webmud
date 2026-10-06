import type { ContentExportDto, ItemTemplateDto, MobLootPoolEntryDto, MobLootPoolItemDto, MobTemplateDto, NpcTemplateDto } from '@mud/shared';
import { authenticatedRequest } from './transport';

export function fetchItemTemplates(token: string): Promise<{ items: ItemTemplateDto[] }> {
  return authenticatedRequest(token, '/admin/items');
}

export function createItemTemplate(
  token: string,
  data: Omit<ItemTemplateDto, 'id'>,
): Promise<{ item: ItemTemplateDto }> {
  return authenticatedRequest(token, '/admin/items', 'POST', data);
}

export function updateItemTemplate(
  token: string,
  id: number,
  data: Omit<ItemTemplateDto, 'id'>,
): Promise<{ item: ItemTemplateDto }> {
  return authenticatedRequest(token, `/admin/items/${id}`, 'PATCH', data);
}

export function deleteItemTemplate(token: string, id: number): Promise<void> {
  return authenticatedRequest(token, `/admin/items/${id}`, 'DELETE');
}

export function fetchMobTemplates(token: string): Promise<{ mobTemplates: MobTemplateDto[] }> {
  return authenticatedRequest(token, '/admin/mob-templates');
}

export function createMobTemplate(
  token: string,
  data: Omit<MobTemplateDto, 'id'>,
): Promise<{ mobTemplate: MobTemplateDto }> {
  return authenticatedRequest(token, '/admin/mob-templates', 'POST', data);
}

export function updateMobTemplate(
  token: string,
  id: number,
  data: Omit<MobTemplateDto, 'id'>,
): Promise<{ mobTemplate: MobTemplateDto }> {
  return authenticatedRequest(token, `/admin/mob-templates/${id}`, 'PATCH', data);
}

export function deleteMobTemplate(token: string, id: number): Promise<void> {
  return authenticatedRequest(token, `/admin/mob-templates/${id}`, 'DELETE');
}

export function fetchMobLootPool(token: string, mobTemplateId: number): Promise<{ items: MobLootPoolItemDto[] }> {
  return authenticatedRequest(token, `/admin/mob-templates/${mobTemplateId}/loot-pool`);
}

export function fetchAllMobLootPools(token: string): Promise<{ items: MobLootPoolEntryDto[] }> {
  return authenticatedRequest(token, '/admin/mob-loot-pool');
}

export function addMobLootPoolItem(
  token: string,
  mobTemplateId: number,
  itemId: number,
  weight?: number,
): Promise<{ items: MobLootPoolItemDto[] }> {
  return authenticatedRequest(token, `/admin/mob-templates/${mobTemplateId}/loot-pool`, 'POST', { itemId, weight });
}

export function removeMobLootPoolItem(token: string, mobTemplateId: number, itemId: number): Promise<void> {
  return authenticatedRequest(token, `/admin/mob-templates/${mobTemplateId}/loot-pool/${itemId}`, 'DELETE');
}

export function exportContent(token: string): Promise<ContentExportDto> {
  return authenticatedRequest(token, '/admin/content-export');
}

export function importContent(
  token: string,
  data: Omit<ContentExportDto, 'exportedAt'>,
): Promise<{ itemCount: number; mobTemplateCount: number; lootEntryCount: number }> {
  return authenticatedRequest(token, '/admin/content-import', 'POST', data);
}

export function fetchNpcTemplates(token: string): Promise<{ npcTemplates: NpcTemplateDto[] }> {
  return authenticatedRequest(token, '/admin/npc-templates');
}

export function createNpcTemplate(
  token: string,
  data: Omit<NpcTemplateDto, 'id'>,
): Promise<{ npcTemplate: NpcTemplateDto }> {
  return authenticatedRequest(token, '/admin/npc-templates', 'POST', data);
}

export function updateNpcTemplate(
  token: string,
  id: number,
  data: Omit<NpcTemplateDto, 'id'>,
): Promise<{ npcTemplate: NpcTemplateDto }> {
  return authenticatedRequest(token, `/admin/npc-templates/${id}`, 'PATCH', data);
}

export function deleteNpcTemplate(token: string, id: number): Promise<void> {
  return authenticatedRequest(token, `/admin/npc-templates/${id}`, 'DELETE');
}
