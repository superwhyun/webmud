import { db } from '../db/client.js';

export interface DeleteRoomCheck {
  allowed: boolean;
  reason?: string;
}

export function canDeleteRoom(roomId: number): DeleteRoomCheck {
  const hasExit = db
    .prepare('SELECT 1 FROM room_exits WHERE room_id = ? OR target_room_id = ? LIMIT 1')
    .get(roomId, roomId);
  if (hasExit) {
    return { allowed: false, reason: '연결된 출구가 있어 방을 삭제할 수 없습니다.' };
  }

  const hasCharacter = db.prepare('SELECT 1 FROM characters WHERE room_id = ? LIMIT 1').get(roomId);
  if (hasCharacter) {
    return { allowed: false, reason: '이 방에 캐릭터가 있어 삭제할 수 없습니다.' };
  }

  const isVillageRoom = db.prepare('SELECT 1 FROM villages WHERE room_id = ? LIMIT 1').get(roomId);
  if (isVillageRoom) {
    return { allowed: false, reason: '마을 영주관은 삭제할 수 없습니다.' };
  }

  return { allowed: true };
}
