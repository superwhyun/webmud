import { apiRequest, authHeader } from './api';

export interface BuilderExitDto {
  direction: string;
  targetRoomId: number;
}

export interface BuilderRoomDto {
  id: number;
  name: string;
  description: string;
  exits: BuilderExitDto[];
}

export function fetchBuilderRooms(token: string): Promise<{ rooms: BuilderRoomDto[] }> {
  return apiRequest('/builder/rooms', { headers: authHeader(token) });
}

export function createBuilderRoom(
  token: string,
  name: string,
  description: string,
): Promise<{ room: BuilderRoomDto }> {
  return apiRequest('/builder/rooms', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ name, description }),
  });
}

export function updateBuilderRoom(
  token: string,
  id: number,
  patch: { name?: string; description?: string },
): Promise<{ room: { id: number; name: string; description: string } }> {
  return apiRequest(`/builder/rooms/${id}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(patch),
  });
}

export function deleteBuilderRoom(token: string, id: number): Promise<void> {
  return apiRequest(`/builder/rooms/${id}`, { method: 'DELETE', headers: authHeader(token) });
}

export function createBuilderExit(
  token: string,
  roomId: number,
  direction: string,
  targetRoomId: number,
  bidirectional: boolean,
): Promise<{ direction: string; targetRoomId: number; reverseCreated: boolean }> {
  return apiRequest('/builder/exits', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ roomId, direction, targetRoomId, bidirectional }),
  });
}

export function deleteBuilderExit(
  token: string,
  roomId: number,
  direction: string,
  alsoReverse: boolean,
): Promise<void> {
  return apiRequest('/builder/exits', {
    method: 'DELETE',
    headers: authHeader(token),
    body: JSON.stringify({ roomId, direction, alsoReverse }),
  });
}
