import type { ClientMessage, ServerMessage } from '@mud/shared';
import { renderAdminScreen } from './adminScreen';
import { renderBuilderScreen } from './builderScreen';
import { attachCommandBarListeners } from './game/commandBar';
import { closeCharacterSheet, isCharacterSheetTabOpen, openCharacterSheet, renderCharacterSheetBody } from './game/characterSheet';
import { appendLine, createGameContext, type GameContext } from './game/context';
import { renderEquipmentPanel, renderInventoryCount, renderPotionSummary } from './game/equipment';
import { closeMacroModal, openMacroModal } from './game/macroPanel';
import { recordRoomVisit, renderMinimap } from './game/minimap';
import { hideCombat, renderCombat, renderRoom, showJobModal } from './game/room';
import { renderBuffPanel, renderCooldownPanel, renderState } from './game/state';
import { closeSuggestionModal, openSuggestionModal } from './game/suggestions';

let currentCtx: GameContext | null = null;

export function renderGameScreen(
  container: HTMLElement,
  token: string,
  isBuilder = false,
  isAdmin = false,
  onLogout: () => void = () => {},
): void {
  const previousCtx = currentCtx;
  const isInitialConnect = previousCtx === null;
  const ctx = createGameContext(container, token, isBuilder, isAdmin, onLogout, previousCtx);
  const { socket } = ctx;
  currentCtx = ctx;

  if (isInitialConnect) {
    setInterval(() => {
      if (currentCtx) {
        renderCooldownPanel(currentCtx);
        renderBuffPanel(currentCtx);
      }
    }, 100);

    socket.addEventListener('open', () => {
      const authMessage: ClientMessage = { type: 'auth', token };
      socket.send(JSON.stringify(authMessage));
    });

    socket.addEventListener('close', () => {
      if (currentCtx) appendLine(currentCtx, '[연결 종료됨]');
    });

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      if (!currentCtx) return;
      const ctx = currentCtx;
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === 'text') {
        appendLine(ctx, message.text, message.channel);
      } else if (message.type === 'error') {
        appendLine(ctx, message.text, 'error');
      } else if (message.type === 'state') {
        renderState(ctx, message.character);
        if (isCharacterSheetTabOpen(ctx, 'equip')) renderCharacterSheetBody(ctx);
      } else if (message.type === 'room') {
        ctx.latestRoom = message.room;
        recordRoomVisit(ctx, message.room);
        renderRoom(ctx, message.room);
        renderMinimap(ctx);
      } else if (message.type === 'death') {
        ctx.lastDeathRoomId = message.roomId;
        renderMinimap(ctx);
      } else if (message.type === 'combat') {
        ctx.latestCombatMobs = message.mobs;
        renderCombat(ctx, message.mobs);
      } else if (message.type === 'combatEnd') {
        ctx.latestCombatMobs = [];
        hideCombat(ctx);
      } else if (message.type === 'equipment') {
        ctx.equipmentState = message.slots;
        renderEquipmentPanel(ctx);
        if (isCharacterSheetTabOpen(ctx, 'equip')) renderCharacterSheetBody(ctx);
      } else if (message.type === 'inventory') {
        ctx.inventoryState = message.items;
        renderInventoryCount(ctx);
        renderPotionSummary(ctx);
        if (isCharacterSheetTabOpen(ctx, 'equip')) renderCharacterSheetBody(ctx);
      } else if (message.type === 'skills') {
        ctx.learnedSkillIds = message.learnedSkillIds;
        ctx.learnedSkillRanks = message.learnedSkillRanks;
        if (isCharacterSheetTabOpen(ctx, 'skill')) renderCharacterSheetBody(ctx);
      } else if (message.type === 'skillCooldowns') {
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
      } else if (message.type === 'activeBuffs') {
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
      } else if (message.type === 'needsJob') {
        showJobModal(ctx, (job) => {
          const chooseJobMessage: ClientMessage = { type: 'chooseJob', job };
          socket.send(JSON.stringify(chooseJobMessage));
        });
      }
    });
  }

  renderEquipmentPanel(ctx);
  renderInventoryCount(ctx);
  renderPotionSummary(ctx);
  renderCooldownPanel(ctx);
  renderBuffPanel(ctx);

  if (!isInitialConnect) {
    if (ctx.currentCharacterState) renderState(ctx, ctx.currentCharacterState);
    if (ctx.latestRoom) {
      recordRoomVisit(ctx, ctx.latestRoom);
      renderRoom(ctx, ctx.latestRoom);
      renderMinimap(ctx);
    }
    if (ctx.latestCombatMobs.length > 0) renderCombat(ctx, ctx.latestCombatMobs);
  }

  attachCommandBarListeners(ctx);

  const builderEntryButton = container.querySelector<HTMLButtonElement>('#builder-entry');
  builderEntryButton?.addEventListener('click', () => {
    renderBuilderScreen(container, token, () => renderGameScreen(container, token, isBuilder, isAdmin, onLogout));
  });

  const adminEntryButton = container.querySelector<HTMLButtonElement>('#admin-entry');
  adminEntryButton?.addEventListener('click', () => {
    renderAdminScreen(container, token, () => renderGameScreen(container, token, isBuilder, isAdmin, onLogout));
  });

  const logoutButton = container.querySelector<HTMLButtonElement>('#logout-button')!;
  logoutButton.addEventListener('click', () => {
    socket.close();
    currentCtx = null;
    onLogout();
  });

  const equipSwapButton = container.querySelector<HTMLButtonElement>('#equip-swap-button')!;
  equipSwapButton.addEventListener('click', () => openCharacterSheet(ctx, 'equip'));

  const skillButton = container.querySelector<HTMLButtonElement>('#skill-button')!;
  skillButton.addEventListener('click', () => openCharacterSheet(ctx, 'skill'));

  const inventoryButton = container.querySelector<HTMLButtonElement>('#inventory-button')!;
  inventoryButton.addEventListener('click', () => openCharacterSheet(ctx, 'equip'));

  const characterSheetCloseButton = container.querySelector<HTMLButtonElement>('#character-sheet-close')!;
  characterSheetCloseButton.addEventListener('click', () => closeCharacterSheet(ctx));

  ctx.characterSheetModal.addEventListener('click', (event) => {
    if (event.target === ctx.characterSheetModal) closeCharacterSheet(ctx);
  });

  const macroButton = container.querySelector<HTMLButtonElement>('#macro-button')!;
  macroButton.addEventListener('click', () => openMacroModal(ctx));

  const macroModalCloseButton = container.querySelector<HTMLButtonElement>('#macro-modal-close')!;
  macroModalCloseButton.addEventListener('click', () => closeMacroModal(ctx));

  ctx.macroModal.addEventListener('click', (event) => {
    if (event.target === ctx.macroModal) closeMacroModal(ctx);
  });

  const suggestionButton = container.querySelector<HTMLButtonElement>('#suggestion-button')!;
  suggestionButton.addEventListener('click', () => openSuggestionModal(ctx));

  const suggestionModalCloseButton = container.querySelector<HTMLButtonElement>('#suggestion-modal-close')!;
  suggestionModalCloseButton.addEventListener('click', () => closeSuggestionModal(ctx));

  ctx.suggestionModal.addEventListener('click', (event) => {
    if (event.target === ctx.suggestionModal) closeSuggestionModal(ctx);
  });

  if (isInitialConnect) {
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !currentCtx) return;
      if (!currentCtx.characterSheetModal.hidden) closeCharacterSheet(currentCtx);
      else if (!currentCtx.macroModal.hidden) closeMacroModal(currentCtx);
      else if (!currentCtx.suggestionModal.hidden) closeSuggestionModal(currentCtx);
    });
  }
}
