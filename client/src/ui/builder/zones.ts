import { createZone, deleteZone, fetchAllRoomOptions, fetchZones, updateZoneLevels } from '../../builderApi';
import { escapeHtml } from '../../domUtils';
import { showToolbarError, type BuilderContext } from './context';

export async function refreshRoomOptions(ctx: BuilderContext): Promise<void> {
  const result = await fetchAllRoomOptions(ctx.token);
  ctx.allRoomOptions = result.rooms;
}

export async function refreshZones(ctx: BuilderContext): Promise<void> {
  const result = await fetchZones(ctx.token);
  ctx.zones = result.zones;
  if (ctx.selectedZoneId === null || !ctx.zones.some((zone) => zone.id === ctx.selectedZoneId)) {
    ctx.selectedZoneId = ctx.zones[0]?.id ?? null;
  }
  renderZoneBar(ctx);
  await ctx.refresh();
}

export function renderZoneBar(ctx: BuilderContext): void {
  const selectedZone = ctx.zones.find((zone) => zone.id === ctx.selectedZoneId);
  ctx.zoneBar.innerHTML = `
    ${ctx.zones
      .map((zone) => {
        const levelRangeText = zone.minLevel !== null && zone.maxLevel !== null ? ` <span class="zone-tab-level">Lv.${zone.minLevel}-${zone.maxLevel}</span>` : '';
        return `
          <span class="zone-tab">
            <button
              type="button"
              class="zone-tab-btn${zone.id === ctx.selectedZoneId ? ' zone-tab-btn-active' : ''}"
              data-zone-id="${zone.id}"
            >${escapeHtml(zone.name)}${levelRangeText}</button>
            <button type="button" class="zone-tab-delete" data-delete-zone-id="${zone.id}" title="존 삭제" aria-label="존 삭제">✕</button>
          </span>
        `;
      })
      .join('')}
    <button type="button" id="builder-zone-add-toggle">+ 존 추가</button>
    <span class="builder-zone-add-form" id="builder-zone-add-form" hidden>
      <input id="builder-zone-name" type="text" maxlength="30" placeholder="존 이름" />
      <input id="builder-zone-desc" type="text" maxlength="200" placeholder="설명(선택)" />
      <input id="builder-zone-min-level" type="number" min="1" value="1" title="존 최소 레벨" />
      <input id="builder-zone-max-level" type="number" min="1" value="5" title="존 최대 레벨" />
      <button type="button" id="builder-zone-add-confirm">추가</button>
    </span>
    ${
      selectedZone
        ? `<span class="builder-zone-level-form">
            <span>존 레벨</span>
            <input id="builder-zone-edit-min-level" type="number" min="1" value="${selectedZone.minLevel ?? 1}" aria-label="존 최소 레벨" />
            <span>–</span>
            <input id="builder-zone-edit-max-level" type="number" min="1" value="${selectedZone.maxLevel ?? 5}" aria-label="존 최대 레벨" />
            <button type="button" id="builder-zone-level-save">저장</button>
          </span>`
        : ''
    }
  `;

  ctx.zoneBar.querySelectorAll<HTMLButtonElement>('[data-zone-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const zoneId = Number(button.dataset.zoneId);
      if (zoneId === ctx.selectedZoneId) return;
      ctx.selectedZoneId = zoneId;
      ctx.selectedRoomId = null;
      ctx.panelMode = 'empty';
      renderZoneBar(ctx);
      void ctx.refresh();
    });
  });

  ctx.zoneBar.querySelectorAll<HTMLButtonElement>('[data-delete-zone-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const zoneId = Number(button.dataset.deleteZoneId);
      const zone = ctx.zones.find((entry) => entry.id === zoneId);
      if (!zone) return;
      if (!confirm(`"${zone.name}" 존을 삭제할까요? 존 안의 모든 방과 연결점이 함께 삭제됩니다.`)) return;

      deleteZone(ctx.token, zoneId)
        .then(() => {
          if (ctx.selectedZoneId === zoneId) {
            ctx.selectedRoomId = null;
            ctx.panelMode = 'empty';
          }
          return refreshZones(ctx);
        })
        .then(() => refreshRoomOptions(ctx))
        .catch((error: unknown) => {
          showToolbarError(ctx, error instanceof Error ? error.message : '존 삭제에 실패했습니다.');
        });
    });
  });

  const addForm = ctx.zoneBar.querySelector<HTMLSpanElement>('#builder-zone-add-form')!;
  ctx.zoneBar.querySelector<HTMLButtonElement>('#builder-zone-add-toggle')!.addEventListener('click', () => {
    addForm.hidden = !addForm.hidden;
  });
  ctx.zoneBar.querySelector<HTMLButtonElement>('#builder-zone-add-confirm')!.addEventListener('click', () => {
    const name = ctx.zoneBar.querySelector<HTMLInputElement>('#builder-zone-name')!.value.trim();
    const description = ctx.zoneBar.querySelector<HTMLInputElement>('#builder-zone-desc')!.value.trim();
    const minLevel = Number(ctx.zoneBar.querySelector<HTMLInputElement>('#builder-zone-min-level')!.value);
    const maxLevel = Number(ctx.zoneBar.querySelector<HTMLInputElement>('#builder-zone-max-level')!.value);
    if (!name) {
      showToolbarError(ctx, '존 이름을 입력하세요.');
      return;
    }
    if (!Number.isInteger(minLevel) || !Number.isInteger(maxLevel) || minLevel < 1 || minLevel > maxLevel) {
      showToolbarError(ctx, '올바른 존 레벨 범위를 입력하세요.');
      return;
    }
    createZone(ctx.token, name, description, minLevel, maxLevel)
      .then((result) => {
        ctx.selectedZoneId = result.zone.id;
        ctx.selectedRoomId = null;
        ctx.panelMode = 'empty';
        return refreshZones(ctx);
      })
      .catch((error: unknown) => {
        showToolbarError(ctx, error instanceof Error ? error.message : '존 생성에 실패했습니다.');
      });
  });

  ctx.zoneBar.querySelector<HTMLButtonElement>('#builder-zone-level-save')?.addEventListener('click', () => {
    if (!selectedZone) return;
    const minLevel = Number(ctx.zoneBar.querySelector<HTMLInputElement>('#builder-zone-edit-min-level')!.value);
    const maxLevel = Number(ctx.zoneBar.querySelector<HTMLInputElement>('#builder-zone-edit-max-level')!.value);
    if (!Number.isInteger(minLevel) || !Number.isInteger(maxLevel) || minLevel < 1 || minLevel > maxLevel) {
      showToolbarError(ctx, '올바른 존 레벨 범위를 입력하세요.');
      return;
    }
    updateZoneLevels(ctx.token, selectedZone.id, minLevel, maxLevel)
      .then(() => refreshZones(ctx))
      .catch((error: unknown) => {
        showToolbarError(ctx, error instanceof Error ? error.message : '존 레벨 저장에 실패했습니다.');
      });
  });
}
