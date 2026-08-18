import { fetchBuilderRooms, fetchMapExport, importMapExport, type MapExportPayload } from '../builderApi';
import { renderAssistantResults, setupAssistant } from './builder/assistant';
import { renderCanvas } from './builder/canvas';
import { createBuilderContext, showToolbarError } from './builder/context';
import { refreshPalette, renderPalette } from './builder/palette';
import { renderPanel } from './builder/panel';
import { refreshRoomOptions, refreshZones } from './builder/zones';

function downloadJson(payload: MapExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mud-map-export-${payload.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

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
    const [result] = await Promise.all([fetchBuilderRooms(ctx.token, ctx.selectedZoneId), refreshPalette(ctx)]);
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

  ctx.exportButton.addEventListener('click', () => {
    fetchMapExport(ctx.token)
      .then((payload) => downloadJson(payload))
      .catch((error: unknown) => {
        showToolbarError(ctx, error instanceof Error ? error.message : '내보내기에 실패했습니다.');
      });
  });

  ctx.importButton.addEventListener('click', () => {
    ctx.importFileInput.value = '';
    ctx.importFileInput.click();
  });

  ctx.importFileInput.addEventListener('change', () => {
    const file = ctx.importFileInput.files?.[0];
    if (!file) return;

    file
      .text()
      .then((text) => JSON.parse(text) as MapExportPayload)
      .then((payload) => {
        const confirmed = window.confirm(
          `"${file.name}" 파일로 서버의 존/방/스폰/아이템/몹/NPC 템플릿 전체를 교체합니다.\n` +
            '계정/캐릭터는 영향받지 않지만, 현재 존재하는 콘텐츠 데이터는 모두 사라집니다. 계속할까요?',
        );
        if (!confirmed) return;
        return importMapExport(ctx.token, payload).then(async () => {
          await refreshZones(ctx);
          await refreshRoomOptions(ctx);
        });
      })
      .catch((error: unknown) => {
        showToolbarError(ctx, error instanceof Error ? error.message : '가져오기에 실패했습니다.');
      });
  });

  setupAssistant(ctx);

  void refreshZones(ctx);
  void refreshPalette(ctx);
  void refreshRoomOptions(ctx);
}
