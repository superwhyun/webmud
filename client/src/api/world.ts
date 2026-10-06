import type { BuilderRoomDto, RoomOptionAllZonesDto, ZoneDto } from '@mud/shared';
import { authenticatedRequest } from './transport';

export function fetchBuilderRooms(token: string, zoneId: number): Promise<{ rooms: BuilderRoomDto[] }> {
  return authenticatedRequest(token, `/builder/rooms?zoneId=${zoneId}`);
}

export function fetchAllRoomOptions(token: string): Promise<{ rooms: RoomOptionAllZonesDto[] }> {
  return authenticatedRequest(token, '/builder/rooms/all');
}

export function createBuilderRoom(
  token: string,
  name: string,
  description: string,
  x: number,
  y: number,
  zoneId: number,
): Promise<{ room: BuilderRoomDto }> {
  return authenticatedRequest(token, '/builder/rooms', 'POST', { name, description, x, y, zoneId });
}

export function fetchZones(token: string): Promise<{ zones: ZoneDto[] }> {
  return authenticatedRequest(token, '/builder/zones');
}

export function createZone(
  token: string,
  name: string,
  description: string,
  minLevel: number,
  maxLevel: number,
): Promise<{ zone: ZoneDto }> {
  return authenticatedRequest(token, '/builder/zones', 'POST', { name, description, minLevel, maxLevel });
}

export function updateZoneLevels(
  token: string,
  id: number,
  minLevel: number,
  maxLevel: number,
): Promise<{ minLevel: number; maxLevel: number }> {
  return authenticatedRequest(token, `/builder/zones/${id}/levels`, 'PATCH', { minLevel, maxLevel });
}

export function deleteZone(token: string, id: number): Promise<void> {
  return authenticatedRequest(token, `/builder/zones/${id}`, 'DELETE');
}

export function addRoomExit(token: string, roomId: number, targetRoomId: number): Promise<void> {
  return authenticatedRequest(token, '/builder/exits', 'POST', { roomId, targetRoomId });
}

export function removeRoomExit(token: string, roomId: number, direction: string): Promise<void> {
  return authenticatedRequest(token, `/builder/exits/${roomId}/${encodeURIComponent(direction)}`, 'DELETE');
}

export function updateBuilderRoom(
  token: string,
  id: number,
  patch: { name?: string; description?: string; x?: number; y?: number },
): Promise<{ room: { id: number; name: string; description: string; x: number; y: number } }> {
  return authenticatedRequest(token, `/builder/rooms/${id}`, 'PATCH', patch);
}

export function deleteBuilderRoom(token: string, id: number): Promise<void> {
  return authenticatedRequest(token, `/builder/rooms/${id}`, 'DELETE');
}

export function setExitBlocked(
  token: string,
  roomId: number,
  direction: string,
  blocked: boolean,
): Promise<{ roomId: number; direction: string; blocked: boolean }> {
  return authenticatedRequest(token, '/builder/exits/block', 'PATCH', { roomId, direction, blocked });
}
