import { db } from '../../../db/client.js';
import { FRONTIER_ROOM_ID } from '../../../db/seed/index.js';
import { loadCharacter, loadCharacterState } from '../../characterState.js';
import { broadcastRoomSnapshot, sendRoomSnapshot } from '../../roomSnapshot.js';
import {
  BUILDING_CATALOG,
  buildOnPlot,
  buyLand,
  depositGold,
  findVillageByCharacterMembership,
  foundVillage,
  getVillageMembers,
  joinVillage,
  listVillages,
  quitVillage,
} from '../../village/VillageService.js';
import type { CommandContext } from '../context.js';
import { lordName, requireLord } from './shared.js';

export function handleVillageFound(ctx: CommandContext, name: string): void {
  const trimmed = name.trim();
  if (ctx.session.roomId !== FRONTIER_ROOM_ID) {
    ctx.send({ type: 'text', text: '마을은 미개척지에서만 세울 수 있습니다.' });
    return;
  }
  if (!trimmed) {
    ctx.send({ type: 'error', text: '마을 이름을 입력하세요. 사용법: village found <이름>' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const result = foundVillage(ctx.session.characterId, character.gold, trimmed);
  if (!result.success || !result.village || result.roomId === undefined) {
    ctx.send({ type: 'text', text: result.error ?? '마을을 세울 수 없습니다.' });
    return;
  }

  ctx.send({ type: 'text', text: `${trimmed} 마을을 세웠습니다! 당신은 이제 이 마을의 영주입니다.` });
  ctx.session.roomId = result.roomId;
  db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(result.roomId, ctx.session.characterId);

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });

  sendRoomSnapshot(ctx);
}

export function handleVillageList(ctx: CommandContext): void {
  const villages = listVillages();
  if (villages.length === 0) {
    ctx.send({ type: 'text', text: '아직 세워진 마을이 없습니다.' });
    return;
  }

  const lines = villages.map(
    (village) => `${village.name} (영주: ${lordName(village.lord_character_id)}, Lv.${village.level})`,
  );
  ctx.send({ type: 'text', text: `세워진 마을 목록:\n${lines.join('\n')}` });
}

export function handleLandBuy(ctx: CommandContext): void {
  const check = requireLord(ctx);
  if (!check.ok) {
    ctx.send({ type: 'text', text: check.error });
    return;
  }

  const result = buyLand(check.village);
  if (!result.success) {
    ctx.send({ type: 'text', text: result.error ?? '땅을 살 수 없습니다.' });
    return;
  }

  ctx.send({ type: 'text', text: `새 땅을 구매했습니다. (국고 gold -${result.cost})` });
  broadcastRoomSnapshot(ctx.session.roomId);
}

export function handleBuild(ctx: CommandContext, rest: string): void {
  const check = requireLord(ctx);
  if (!check.ok) {
    ctx.send({ type: 'text', text: check.error });
    return;
  }

  const [indexText, buildingType] = rest.trim().split(/\s+/);
  const plotIndex = Number(indexText);

  if (!indexText || Number.isNaN(plotIndex) || !buildingType) {
    const options = Object.values(BUILDING_CATALOG)
      .map((b) => `${b.type}(${b.name})`)
      .join(', ');
    ctx.send({ type: 'error', text: `사용법: village build <칸번호> <건물종류>. 가능한 종류: ${options}` });
    return;
  }

  const result = buildOnPlot(check.village, plotIndex, buildingType);
  if (!result.success || !result.building) {
    ctx.send({ type: 'text', text: result.error ?? '건설할 수 없습니다.' });
    return;
  }

  ctx.send({
    type: 'text',
    text: `${plotIndex}번 칸에 ${result.building.name}을(를) 건설했습니다. (국고 gold -${result.building.cost})`,
  });
  broadcastRoomSnapshot(ctx.session.roomId);
}

export function handleDeposit(ctx: CommandContext, rest: string): void {
  const village = findVillageByCharacterMembership(ctx.session.characterId);
  if (!village) {
    ctx.send({ type: 'text', text: '소속된 마을이 없습니다.' });
    return;
  }

  const amount = Math.floor(Number(rest.trim()));
  if (!rest.trim() || Number.isNaN(amount)) {
    ctx.send({ type: 'error', text: '사용법: village deposit <금액>' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const result = depositGold(village, ctx.session.characterId, character.gold, amount);
  if (!result.success) {
    ctx.send({ type: 'text', text: result.error ?? '기부할 수 없습니다.' });
    return;
  }

  ctx.send({ type: 'text', text: `마을 국고에 gold ${amount}을(를) 기부했습니다.` });

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });

  broadcastRoomSnapshot(ctx.session.roomId);
}

export function handleJoin(ctx: CommandContext, rest: string): void {
  const result = joinVillage(ctx.session.characterId, rest);
  if (!result.success || !result.village) {
    ctx.send({ type: 'text', text: result.error ?? '가입할 수 없습니다.' });
    return;
  }

  ctx.send({
    type: 'text',
    text: `${result.village.name} 마을에 가입했습니다. 이제 전투로 얻는 gold의 ${result.village.tithe_percent}%가 마을에 자동으로 상납됩니다.`,
  });
  broadcastRoomSnapshot(result.village.room_id);
}

export function handleQuit(ctx: CommandContext): void {
  const result = quitVillage(ctx.session.characterId);
  if (!result.success || !result.village) {
    ctx.send({ type: 'text', text: result.error ?? '탈퇴할 수 없습니다.' });
    return;
  }

  ctx.send({ type: 'text', text: `${result.village.name} 마을에서 탈퇴했습니다.` });
  broadcastRoomSnapshot(result.village.room_id);
}

export function handleMembers(ctx: CommandContext): void {
  const village = findVillageByCharacterMembership(ctx.session.characterId);
  if (!village) {
    ctx.send({ type: 'text', text: '소속된 마을이 없습니다.' });
    return;
  }

  const members = getVillageMembers(village.id);
  const lines = members.map((member) => `${member.character_name}${member.role === 'lord' ? ' (영주)' : ''}`);
  ctx.send({ type: 'text', text: `${village.name} 마을원 (${members.length}명):\n${lines.join('\n')}` });
}
