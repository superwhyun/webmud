import { josaEulReul, josaIGa, withJosa } from '@mud/shared';
import { db } from '../db/client.js';
import { getRoom } from './World.js';
import { broadcastToZone } from './sessionRegistry.js';

function zoneNameForRoom(zoneId: number): string {
  const zone = db.prepare('SELECT name FROM zones WHERE id = ?').get(zoneId) as { name: string } | undefined;
  return zone?.name ?? '알 수 없는 지역';
}

/** 보스가(재)출현했을 때 존 전체에 알린다 — worldTick의 리스폰 처리에서 호출된다. */
export function announceBossSpawned(roomId: number, bossName: string): void {
  const room = getRoom(roomId);
  if (!room) return;
  const zoneName = zoneNameForRoom(room.zoneId);
  broadcastToZone(room.zoneId, {
    type: 'text',
    text: `[보스 출현] ${zoneName}에 ${withJosa(bossName, josaIGa)} 나타났습니다!`,
    channel: 'combat-engage',
  });
}

/** 보스를 처치했을 때 존 전체에 알린다 — handleMobDefeat에서 호출된다. */
export function announceBossDefeated(roomId: number, bossName: string, killerName: string): void {
  const room = getRoom(roomId);
  if (!room) return;
  const zoneName = zoneNameForRoom(room.zoneId);
  broadcastToZone(room.zoneId, {
    type: 'text',
    text: `[보스 처치] ${killerName}님이 ${zoneName}의 보스 ${withJosa(bossName, josaEulReul)} 처치했습니다!`,
    channel: 'combat-victory',
  });
}
