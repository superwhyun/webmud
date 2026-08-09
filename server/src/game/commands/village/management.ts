import { db } from '../../../db/client.js';
import { FRONTIER_ROOM_ID } from '../../../db/seed/index.js';
import { broadcastRoomSnapshot, sendRoomSnapshot } from '../../roomSnapshot.js';
import { getSessionsInRoom } from '../../sessionRegistry.js';
import { disbandVillage, transferLordship, upgradeVillage } from '../../village/VillageService.js';
import { send } from '../../wsUtil.js';
import type { CommandContext } from '../context.js';
import { requireLord } from './shared.js';

export function handleUpgrade(ctx: CommandContext): void {
  const check = requireLord(ctx);
  if (!check.ok) {
    ctx.send({ type: 'text', text: check.error });
    return;
  }

  const result = upgradeVillage(check.village);
  if (!result.success || !result.cost || result.newLevel === undefined) {
    ctx.send({ type: 'text', text: result.error ?? '업그레이드할 수 없습니다.' });
    return;
  }

  ctx.send({
    type: 'text',
    text: `마을이 Lv.${result.newLevel}(으)로 성장했습니다! (국고 gold -${result.cost.gold}, 목재 -${result.cost.wood}, 광석 -${result.cost.ore}, 식량 -${result.cost.food})`,
  });
  broadcastRoomSnapshot(check.village.room_id);
}

export function handleTransfer(ctx: CommandContext, rest: string): void {
  const check = requireLord(ctx);
  if (!check.ok) {
    ctx.send({ type: 'text', text: check.error });
    return;
  }

  const result = transferLordship(check.village, rest);
  if (!result.success) {
    ctx.send({ type: 'text', text: result.error ?? '영주를 위임할 수 없습니다.' });
    return;
  }

  ctx.send({ type: 'text', text: `영주 자리를 ${result.newLordName}님에게 위임했습니다.` });
  broadcastRoomSnapshot(check.village.room_id);
}

export function handleDisband(ctx: CommandContext): void {
  const check = requireLord(ctx);
  if (!check.ok) {
    ctx.send({ type: 'text', text: check.error });
    return;
  }

  const village = check.village;
  const occupants = getSessionsInRoom(village.room_id);

  disbandVillage(village);

  ctx.send({ type: 'text', text: `${village.name} 마을을 해체했습니다.` });

  for (const session of occupants) {
    session.roomId = FRONTIER_ROOM_ID;
    db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(FRONTIER_ROOM_ID, session.characterId);
    if (session.ws !== ctx.session.ws) {
      send(session.ws, { type: 'text', text: `${village.name} 마을이 해체되어 미개척지로 이동합니다.` });
    }
    sendRoomSnapshot({ session, send: (message) => send(session.ws, message) });
  }
}
