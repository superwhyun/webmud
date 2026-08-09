import { getMobsInRoom } from '../../MobManager.js';
import { broadcastRoomSnapshot } from '../../roomSnapshot.js';
import { addGarrisonMob, findVillageByCharacterMembership, getGarrisonCapacity, removeGarrisonMob } from '../../village/VillageService.js';
import type { CommandContext } from '../context.js';
import { requireLord } from './shared.js';

function handleGarrisonAdd(ctx: CommandContext, mobName: string): void {
  const check = requireLord(ctx);
  if (!check.ok) {
    ctx.send({ type: 'text', text: check.error });
    return;
  }

  const result = addGarrisonMob(check.village, mobName);
  if (!result.success) {
    ctx.send({ type: 'text', text: result.error ?? '수비대를 배치할 수 없습니다.' });
    return;
  }

  ctx.send({
    type: 'text',
    text: `${result.mobName}을(를) 수비대로 배치했습니다. (국고 gold -${result.cost})`,
  });
  broadcastRoomSnapshot(check.village.room_id);
}

function handleGarrisonList(ctx: CommandContext): void {
  const village = findVillageByCharacterMembership(ctx.session.characterId);
  if (!village) {
    ctx.send({ type: 'text', text: '소속된 마을이 없습니다.' });
    return;
  }

  const capacity = getGarrisonCapacity(village.id);
  const garrison = getMobsInRoom(village.room_id);
  if (garrison.length === 0) {
    ctx.send({ type: 'text', text: `수비대가 없습니다. (0/${capacity})` });
    return;
  }

  const lines = garrison.map((mob) => `${mob.name} (${mob.hp}/${mob.maxHp})`);
  ctx.send({ type: 'text', text: `수비대 (${garrison.length}/${capacity}):\n${lines.join('\n')}` });
}

function handleGarrisonRemove(ctx: CommandContext, mobName: string): void {
  const check = requireLord(ctx);
  if (!check.ok) {
    ctx.send({ type: 'text', text: check.error });
    return;
  }

  const result = removeGarrisonMob(check.village, mobName);
  if (!result.success) {
    ctx.send({ type: 'text', text: result.error ?? '수비대를 해고할 수 없습니다.' });
    return;
  }

  ctx.send({ type: 'text', text: `${result.mobName}을(를) 수비대에서 해고했습니다.` });
  broadcastRoomSnapshot(check.village.room_id);
}

export function handleGarrison(ctx: CommandContext, rest: string): void {
  const spaceIndex = rest.trim().indexOf(' ');
  const sub = spaceIndex === -1 ? rest.trim() : rest.trim().slice(0, spaceIndex);
  const subRest = spaceIndex === -1 ? '' : rest.trim().slice(spaceIndex + 1);

  if (sub.toLowerCase() === 'add') {
    handleGarrisonAdd(ctx, subRest);
    return;
  }
  if (sub.toLowerCase() === 'list') {
    handleGarrisonList(ctx);
    return;
  }
  if (sub.toLowerCase() === 'remove') {
    handleGarrisonRemove(ctx, subRest);
    return;
  }
  ctx.send({
    type: 'error',
    text: '사용법: village garrison add <몬스터> | village garrison list | village garrison remove <몬스터>',
  });
}
