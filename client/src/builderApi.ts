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
  exits: BuilderExitDto[];
}

export function fetchBuilderRooms(token: string): Promise<{ rooms: BuilderRoomDto[] }> {
  return apiRequest('/builder/rooms', { headers: authHeader(token) });
}

export function createBuilderRoom(
  token: string,
  name: string,
  description: string,
  x: number,
  y: number,
): Promise<{ room: BuilderRoomDto }> {
  return apiRequest('/builder/rooms', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ name, description, x, y }),
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
