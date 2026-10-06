import { createMessageDispatcher, type ClientMessage, type ServerMessage } from '@mud/shared';
import { isCharacterSheetTabOpen, renderCharacterSheetBody } from './characterSheet';
import { appendLine, type GameContext } from './context';
import { EQUIP_STAT_STRIP_KEYS, renderEquipmentPanel, renderInventoryCount, renderPotionSummary } from './equipment';
import { recordRoomVisit, renderMinimap } from './minimap';
import { hideCombat, renderCombat, renderRoom, renderRoomMeta, showJobModal, syncRoomMobsWithCombat } from './room';
import { renderBuffPanel, renderCooldownPanel, renderState } from './state';

export const dispatchServerMessage = createMessageDispatcher<GameContext, ServerMessage>({
  text: (ctx, message) => {
    appendLine(ctx, message.text, message.channel);
  },
  error: (ctx, message) => {
    appendLine(ctx, message.text, 'error');
  },
  state: (ctx, message) => {
    const previousCharacter = ctx.currentCharacterState;
    renderState(ctx, message.character);
    // 장비 탭 스탯 요약과 무관한 필드만 바뀐 state(예: 휴식 중 HP/MP 틱)로는 다시
    // 그리지 않는다 — 그렇지 않으면 장비 탭을 켜둔 채 쉴 때마다 카드가 반짝거린다.
    const equipStatsChanged =
      !previousCharacter || EQUIP_STAT_STRIP_KEYS.some((key) => previousCharacter[key] !== message.character[key]);
    if (equipStatsChanged && isCharacterSheetTabOpen(ctx, 'equip')) renderCharacterSheetBody(ctx);
  },
  room: (ctx, message) => {
    ctx.latestRoom = message.room;
    recordRoomVisit(ctx, message.room);
    renderRoom(ctx, message.room);
    renderMinimap(ctx);
  },
  death: (ctx, message) => {
    ctx.lastDeathRoomId = message.roomId;
    renderMinimap(ctx);
  },
  combat: (ctx, message) => {
    ctx.latestCombatMobs = message.mobs;
    if (ctx.latestRoom) {
      ctx.latestRoom = syncRoomMobsWithCombat(ctx.latestRoom, message.mobs);
      renderRoomMeta(ctx, ctx.latestRoom);
    }
    renderCombat(ctx, message.mobs);
  },
  combatEnd: (ctx) => {
    ctx.latestCombatMobs = [];
    hideCombat(ctx);
  },
  equipment: (ctx, message) => {
    ctx.equipmentState = message.slots;
    renderEquipmentPanel(ctx);
    if (isCharacterSheetTabOpen(ctx, 'equip')) renderCharacterSheetBody(ctx);
    else if (isCharacterSheetTabOpen(ctx, 'stats')) renderCharacterSheetBody(ctx);
  },
  inventory: (ctx, message) => {
    ctx.inventoryState = message.items;
    renderInventoryCount(ctx);
    renderPotionSummary(ctx);
    if (isCharacterSheetTabOpen(ctx, 'equip')) renderCharacterSheetBody(ctx);
  },
  skills: (ctx, message) => {
    ctx.learnedSkillIds = message.learnedSkillIds;
    ctx.learnedSkillRanks = message.learnedSkillRanks;
    if (isCharacterSheetTabOpen(ctx, 'skill')) renderCharacterSheetBody(ctx);
  },
  skillCooldowns: (ctx, message) => {
    const now = Date.now();
    const activeIds = new Set(message.cooldowns.map((cooldown) => cooldown.skillId));
    for (const skillId of ctx.activeCooldowns.keys()) {
      if (!activeIds.has(skillId)) ctx.activeCooldowns.delete(skillId);
    }
    for (const cooldown of message.cooldowns) {
      ctx.activeCooldowns.set(cooldown.skillId, {
        name: cooldown.name,
        endsAt: now + cooldown.remainingMs,
        totalMs: cooldown.totalMs,
      });
    }
    renderCooldownPanel(ctx);
  },
  activeBuffs: (ctx, message) => {
    const now = Date.now();
    const activeIds = new Set(message.buffs.map((buff) => buff.skillId));
    for (const skillId of ctx.activeBuffs.keys()) {
      if (!activeIds.has(skillId)) ctx.activeBuffs.delete(skillId);
    }
    for (const buff of message.buffs) {
      ctx.activeBuffs.set(buff.skillId, {
        name: buff.name,
        buffStat: buff.buffStat,
        amount: buff.amount,
        endsAt: now + buff.remainingMs,
        totalMs: buff.totalMs,
      });
    }
    renderBuffPanel(ctx);
    // state와 activeBuffs 중 어느 쪽이 먼저 도착하든(캐스터/피시전자 순서가 다름) 사이드바
    // 스탯 강조 표시가 최종적으로 activeBuffs 기준과 어긋나지 않도록 다시 그린다.
    if (ctx.currentCharacterState) renderState(ctx, ctx.currentCharacterState);
    if (isCharacterSheetTabOpen(ctx, 'stats')) renderCharacterSheetBody(ctx);
  },
  needsJob: (ctx) => {
    showJobModal(ctx, (job) => {
      const chooseJobMessage: ClientMessage = { type: 'chooseJob', job };
      ctx.socket.send(JSON.stringify(chooseJobMessage));
    });
  },
});
