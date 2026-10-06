import { renderAdminScreen } from './adminScreen';
import { renderBuilderScreen } from './builderScreen';
import { createGameContext, type GameContext } from './game/context';
import { renderEquipmentPanel, renderInventoryCount, renderPotionSummary } from './game/equipment';
import { attachGameScreenListeners } from './game/events';
import { disposeCommandBar, detachCommandFocus } from './game/commandBar';
import { clearGameLog } from './game/log';
import { recordRoomVisit, renderMinimap } from './game/minimap';
import { renderCombat, renderRoom } from './game/room';
import { bindGameSession } from './game/session';
import { renderBuffPanel, renderCooldownPanel, renderState } from './game/state';

let currentCtx: GameContext | null = null;
let disposeSession: (() => void) | null = null;

export function disposeGameScreen(): void {
  disposeSession?.();
  disposeSession = null;
  const socket = currentCtx?.socket;
  currentCtx = null;
  if (socket) {
    disposeCommandBar(socket);
    socket.close();
  }
  clearGameLog();
}

export function renderGameScreen(
  container: HTMLElement,
  token: string,
  isBuilder = false,
  isAdmin = false,
  onLogout: () => void = () => {},
): void {
  if (currentCtx && currentCtx.token !== token) disposeGameScreen();
  const previousCtx = currentCtx;
  const ctx = createGameContext(container, token, isBuilder, isAdmin, onLogout, previousCtx);
  currentCtx = ctx;
  if (!previousCtx) disposeSession = bindGameSession(ctx.socket, token, () => currentCtx);

  renderEquipmentPanel(ctx);
  renderInventoryCount(ctx);
  renderPotionSummary(ctx);
  renderCooldownPanel(ctx);
  renderBuffPanel(ctx);
  if (previousCtx) {
    if (ctx.currentCharacterState) renderState(ctx, ctx.currentCharacterState);
    if (ctx.latestRoom) {
      recordRoomVisit(ctx, ctx.latestRoom);
      renderRoom(ctx, ctx.latestRoom);
      renderMinimap(ctx);
    }
    if (ctx.latestCombatMobs.length > 0) renderCombat(ctx, ctx.latestCombatMobs);
  }

  const resume = () => renderGameScreen(container, token, isBuilder, isAdmin, onLogout);
  attachGameScreenListeners(ctx, {
    openBuilder: () => {
      detachCommandFocus();
      renderBuilderScreen(container, token, resume);
    },
    openAdmin: () => {
      detachCommandFocus();
      renderAdminScreen(container, token, resume);
    },
    logout: () => {
      disposeGameScreen();
      onLogout();
    },
  });
}
