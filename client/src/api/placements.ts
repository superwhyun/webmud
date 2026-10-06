import type { ItemTemplateDto, MobSpawnDto, MobTemplateDto, NpcSpawnDto, NpcTemplateDto, RoomItemDto } from '@mud/shared';
import { authenticatedRequest } from './transport';

export function fetchBuilderItemTemplates(token: string): Promise<{ items: ItemTemplateDto[] }> {
  return authenticatedRequest(token, '/builder/item-templates');
}

export function fetchBuilderMobTemplates(token: string): Promise<{ mobTemplates: MobTemplateDto[] }> {
  return authenticatedRequest(token, '/builder/mob-templates');
}

export function fetchBuilderRoomItems(token: string): Promise<{ roomItems: RoomItemDto[] }> {
  return authenticatedRequest(token, '/builder/room-items');
}

export function placeBuilderRoomItem(token: string, roomId: number, itemId: number, quantity: number): Promise<void> {
  return authenticatedRequest(token, '/builder/room-items', 'POST', { roomId, itemId, quantity });
}

export function removeBuilderRoomItem(token: string, roomItemId: number): Promise<void> {
  return authenticatedRequest(token, '/builder/room-items', 'DELETE', { roomItemId });
}

export function fetchBuilderMobSpawns(token: string): Promise<{ mobSpawns: MobSpawnDto[] }> {
  return authenticatedRequest(token, '/builder/mob-spawns');
}

export function placeBuilderMobSpawn(
  token: string,
  roomId: number,
  mobTemplateId: number,
  respawnSeconds: number,
  minLevel?: number | null,
  maxLevel?: number | null,
): Promise<{ spawnId: number }> {
  return authenticatedRequest(token, '/builder/mob-spawns', 'POST', { roomId, mobTemplateId, respawnSeconds, minLevel, maxLevel });
}

export function removeBuilderMobSpawn(token: string, spawnId: number): Promise<void> {
  return authenticatedRequest(token, `/builder/mob-spawns/${spawnId}`, 'DELETE');
}

export function fetchBuilderNpcTemplates(token: string): Promise<{ npcTemplates: NpcTemplateDto[] }> {
  return authenticatedRequest(token, '/builder/npc-templates');
}

export function fetchBuilderNpcSpawns(token: string): Promise<{ npcSpawns: NpcSpawnDto[] }> {
  return authenticatedRequest(token, '/builder/npc-spawns');
}

export function placeBuilderNpcSpawn(token: string, roomId: number, npcTemplateId: number): Promise<{ spawnId: number }> {
  return authenticatedRequest(token, '/builder/npc-spawns', 'POST', { roomId, npcTemplateId });
}

export function removeBuilderNpcSpawn(token: string, spawnId: number): Promise<void> {
  return authenticatedRequest(token, `/builder/npc-spawns/${spawnId}`, 'DELETE');
}
