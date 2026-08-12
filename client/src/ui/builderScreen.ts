import { fetchBuilderRooms } from '../builderApi';
import { renderAssistantResults, setupAssistant } from './builder/assistant';
import { renderCanvas } from './builder/canvas';
import { createBuilderContext } from './builder/context';
import { refreshPalette, renderPalette } from './builder/palette';
import { renderPanel } from './builder/panel';
import { refreshRoomOptions, refreshZones } from './builder/zones';

export function renderBuilderScreen(container: HTMLElement, token: string, onBack: () => void): void {
  const ctx = createBuilderContext(container, token, onBack);

  ctx.rerenderAll = () => {
    renderCanvas(ctx);
    renderPanel(ctx);
    renderPalette(ctx);
    renderAssistantResults(ctx);
  };

  ctx.refresh = async () => {
    if (ctx.selectedZoneId === null) return;
    const result = await fetchBuilderRooms(ctx.token, ctx.selectedZoneId);
    ctx.rooms = result.rooms;
    ctx.rerenderAll();
  };

  ctx.svg.addEventListener('pointerdown', () => {
    ctx.selectedRoomId = null;
    ctx.panelMode = 'empty';
    ctx.rerenderAll();
  });

  ctx.addRoomButton.addEventListener('click', () => {
    ctx.panelMode = 'create';
    renderPanel(ctx);
  });

  ctx.backButton.addEventListener('click', onBack);

  setupAssistant(ctx);

  void refreshZones(ctx);
  void refreshPalette(ctx);
  void refreshRoomOptions(ctx);
}
