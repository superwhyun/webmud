import type { RoomOptionDto, SessionDto } from '@mud/shared';
import { authenticatedRequest } from './transport';

export function fetchSessions(token: string): Promise<{ sessions: SessionDto[] }> {
  return authenticatedRequest(token, '/admin/sessions');
}

export function moderationMove(token: string, characterName: string, targetRoomId: number): Promise<void> {
  return authenticatedRequest(token, '/admin/moderation/move', 'POST', { characterName, targetRoomId });
}

export function moderationKick(token: string, characterName: string, reason?: string): Promise<void> {
  return authenticatedRequest(token, '/admin/moderation/kick', 'POST', { characterName, reason });
}

export function sendAnnouncement(token: string, message: string): Promise<void> {
  return authenticatedRequest(token, '/admin/announce', 'POST', { message });
}

export function fetchAdminRooms(token: string): Promise<{ rooms: RoomOptionDto[] }> {
  return authenticatedRequest(token, '/admin/rooms');
}
