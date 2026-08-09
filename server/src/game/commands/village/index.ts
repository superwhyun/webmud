import { db } from '../../../db/client.js';
import { FRONTIER_ROOM_ID } from '../../../db/seed/index.js';
import { loadCharacterState } from '../../characterState.js';
import { sendRoomSnapshot } from '../../roomSnapshot.js';
import { RAID_UNLOCK_LEVEL } from '../../village/RaidService.js';
import { findVillageByCharacterMembership, findVillageByName, findVillageByRoomId } from '../../village/VillageService.js';
import type { CommandContext } from '../context.js';
import {
  handleBuild,
  handleDeposit,
  handleJoin,
  handleLandBuy,
  handleMembers,
  handleQuit,
  handleVillageFound,
  handleVillageList,
} from './core.js';
import { handleGarrison } from './garrison.js';
import { handleDisband, handleTransfer, handleUpgrade } from './management.js';

export { requireLord } from './shared.js';

export function handleVillage(ctx: CommandContext, rest: string): void {
  const trimmed = rest.trim();
  const spaceIndex = trimmed.indexOf(' ');
  const subcommand = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const subRest = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1);

  switch (subcommand.toLowerCase()) {
    case 'found':
      handleVillageFound(ctx, subRest);
      return;
    case 'list':
      handleVillageList(ctx);
      return;
    case 'land':
      if (subRest.trim().toLowerCase() === 'buy') {
        handleLandBuy(ctx);
      } else {
        ctx.send({ type: 'error', text: '사용법: village land buy' });
      }
      return;
    case 'build':
      handleBuild(ctx, subRest);
      return;
    case 'deposit':
      handleDeposit(ctx, subRest);
      return;
    case 'join':
      handleJoin(ctx, subRest);
      return;
    case 'quit':
      handleQuit(ctx);
      return;
    case 'members':
      handleMembers(ctx);
      return;
    case 'garrison':
      handleGarrison(ctx, subRest);
      return;
    case 'upgrade':
      handleUpgrade(ctx);
      return;
    case 'transfer':
      handleTransfer(ctx, subRest);
      return;
    case 'disband':
      handleDisband(ctx);
      return;
    default:
      ctx.send({
        type: 'text',
        text: '사용법: village found <이름> | village list | village join <이름> | village quit | village members | village deposit <금액> | village land buy | village build <칸번호> <종류> | village garrison add/list/remove <몬스터> | village upgrade | village transfer <이름> | village disband',
      });
  }
}

export function handleTravel(ctx: CommandContext, name: string): void {
  const trimmed = name.trim();
  if (ctx.session.roomId !== FRONTIER_ROOM_ID) {
    ctx.send({ type: 'text', text: '미개척지에서만 다른 마을로 이동할 수 있습니다.' });
    return;
  }
  if (!trimmed) {
    ctx.send({ type: 'error', text: '이동할 마을 이름을 입력하세요. 사용법: travel <마을이름>' });
    return;
  }

  const village = findVillageByName(trimmed);
  if (!village) {
    ctx.send({ type: 'text', text: '그런 이름의 마을이 없습니다.' });
    return;
  }

  const membership = findVillageByCharacterMembership(ctx.session.characterId);
  const isMember = membership?.id === village.id;
  if (!isMember && village.level < RAID_UNLOCK_LEVEL) {
    ctx.send({
      type: 'text',
      text: `${village.name} 마을은 아직 다른 곳과 길이 연결되지 않았습니다. 마을원만 들어갈 수 있습니다.`,
    });
    return;
  }

  ctx.session.roomId = village.room_id;
  db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(village.room_id, ctx.session.characterId);

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });

  sendRoomSnapshot(ctx);
}

export function handleLeave(ctx: CommandContext): void {
  const village = findVillageByRoomId(ctx.session.roomId);
  if (!village) {
    ctx.send({ type: 'text', text: '이곳은 마을이 아닙니다.' });
    return;
  }

  ctx.session.roomId = FRONTIER_ROOM_ID;
  db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(FRONTIER_ROOM_ID, ctx.session.characterId);

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });

  sendRoomSnapshot(ctx);
}
