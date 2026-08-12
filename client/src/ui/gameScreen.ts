import type { ClientMessage, ServerMessage } from '@mud/shared';
import { renderAdminScreen } from './adminScreen';
import { renderBuilderScreen } from './builderScreen';
import { attachCommandBarListeners } from './game/commandBar';
import { appendLine, createGameContext, type GameContext } from './game/context';
import {
  closeEquipModal,
  closeInventoryModal,
  openEquipModal,
  openInventoryModal,
  renderEquipModal,
  renderEquipmentPanel,
  renderInventoryCount,
  renderInventoryModal,
  renderPotionSummary,
} from './game/equipment';
import { closeMacroModal, openMacroModal } from './game/macroPanel';
import { recordRoomVisit, renderMinimap } from './game/minimap';
import { hideCombat, renderCombat, renderRoom, showJobModal } from './game/room';
import { closeSkillModal, openSkillModal, renderSkillModal } from './game/skills';
import { renderCooldownPanel, renderState } from './game/state';

let activeSocket: WebSocket | null = null;
let currentCtx: GameContext | null = null;

export function renderGameScreen(
  container: HTMLElement,
  token: string,
  isBuilder = false,
  isAdmin = false,
  onLogout: () => void = () => {},
): void {
  const isInitialConnect = activeSocket === null;
  const ctx = createGameContext(container, token, isBuilder, isAdmin, onLogout, activeSocket);
  const { socket } = ctx;
  activeSocket = socket;
  currentCtx = ctx;

  if (isInitialConnect) {
    setInterval(() => {
      if (currentCtx) renderCooldownPanel(currentCtx);
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
        if (!ctx.equipModal.hidden) renderEquipModal(ctx);
      } else if (message.type === 'inventory') {
        ctx.inventoryState = message.items;
        renderInventoryCount(ctx);
        renderPotionSummary(ctx);
        if (!ctx.inventoryModal.hidden) renderInventoryModal(ctx);
        if (!ctx.equipModal.hidden) renderEquipModal(ctx);
      } else if (message.type === 'skills') {
        ctx.learnedSkillIds = message.learnedSkillIds;
        if (!ctx.skillModal.hidden) renderSkillModal(ctx);
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
    activeSocket = null;
    currentCtx = null;
    onLogout();
  });

  const equipSwapButton = container.querySelector<HTMLButtonElement>('#equip-swap-button')!;
  equipSwapButton.addEventListener('click', () => openEquipModal(ctx));

  const equipModalCloseButton = container.querySelector<HTMLButtonElement>('#equip-modal-close')!;
  equipModalCloseButton.addEventListener('click', () => closeEquipModal(ctx));

  ctx.equipModal.addEventListener('click', (event) => {
    if (event.target === ctx.equipModal) closeEquipModal(ctx);
  });

  const skillButton = container.querySelector<HTMLButtonElement>('#skill-button')!;
  skillButton.addEventListener('click', () => openSkillModal(ctx));

  const skillModalCloseButton = container.querySelector<HTMLButtonElement>('#skill-modal-close')!;
  skillModalCloseButton.addEventListener('click', () => closeSkillModal(ctx));

  ctx.skillModal.addEventListener('click', (event) => {
    if (event.target === ctx.skillModal) closeSkillModal(ctx);
  });

  const macroButton = container.querySelector<HTMLButtonElement>('#macro-button')!;
  macroButton.addEventListener('click', () => openMacroModal(ctx));

  const macroModalCloseButton = container.querySelector<HTMLButtonElement>('#macro-modal-close')!;
  macroModalCloseButton.addEventListener('click', () => closeMacroModal(ctx));

  ctx.macroModal.addEventListener('click', (event) => {
    if (event.target === ctx.macroModal) closeMacroModal(ctx);
  });

  const inventoryButton = container.querySelector<HTMLButtonElement>('#inventory-button')!;
  inventoryButton.addEventListener('click', () => openInventoryModal(ctx));

  const inventoryModalCloseButton = container.querySelector<HTMLButtonElement>('#inventory-modal-close')!;
  inventoryModalCloseButton.addEventListener('click', () => closeInventoryModal(ctx));

  ctx.inventoryModal.addEventListener('click', (event) => {
    if (event.target === ctx.inventoryModal) closeInventoryModal(ctx);
  });
}
