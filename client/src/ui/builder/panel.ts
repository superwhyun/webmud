import { DIRECTION_LABELS } from '@mud/shared';
import { addRoomExit, createBuilderRoom, deleteBuilderRoom, removeRoomExit, updateBuilderRoom, type BuilderRoomDto } from '../../builderApi';
import { escapeHtml } from '../../domUtils';
import {
  availableDirectionsFrom,
  CARDINAL_OFFSET,
  CARDINAL_SET,
  computeFreeCell,
  findRoom,
  showToolbarError,
  type BuilderContext,
  type CardinalDirection,
  type Point,
} from './context';
import { refreshRoomOptions } from './zones';
import type { RoomOptionAllZonesDto } from '../../builderApi';

function fieldRow(labelText: string, inputHtml: string): string {
  return `<div class="builder-field"><label>${labelText}</label>${inputHtml}</div>`;
}

export function renderPanel(ctx: BuilderContext): void {
  if (ctx.panelMode === 'create') {
    const anchor = ctx.selectedRoomId !== null ? findRoom(ctx, ctx.selectedRoomId) : undefined;
    const directions = anchor ? availableDirectionsFrom(ctx, anchor) : [];
    const willLink = Boolean(anchor && directions.length > 0);

    const hint = willLink
      ? `<p class="builder-panel-hint">"${escapeHtml(anchor!.name)}"에 연결된 새 방을 만듭니다.</p>`
      : anchor
        ? `<p class="builder-panel-hint">"${escapeHtml(anchor.name)}" 주변에 빈 칸이 없어 독립된 위치에 만듭니다.</p>`
        : `<p class="builder-panel-hint">방을 선택하지 않아 독립된 위치에 만듭니다.</p>`;

    ctx.panel.innerHTML = `
      <h3>새 방</h3>
      ${hint}
      ${
        willLink
          ? fieldRow(
              '방향',
              `<select id="builder-new-direction">${directions
                .map((direction) => `<option value="${direction}">${DIRECTION_LABELS[direction]}</option>`)
                .join('')}</select>`,
            )
          : ''
      }
      ${fieldRow('이름', '<input id="builder-new-name" type="text" maxlength="50" />')}
      ${fieldRow('설명', '<textarea id="builder-new-desc" maxlength="500" rows="4"></textarea>')}
      <p class="builder-error" id="builder-create-error"></p>
      <div class="builder-form-row">
        <button type="button" id="builder-create-confirm">만들기</button>
        <button type="button" id="builder-create-cancel">취소</button>
      </div>
    `;
    const errorEl = ctx.panel.querySelector<HTMLParagraphElement>('#builder-create-error')!;
    ctx.panel.querySelector<HTMLButtonElement>('#builder-create-cancel')!.addEventListener('click', () => {
      ctx.panelMode = 'empty';
      renderPanel(ctx);
    });
    ctx.panel.querySelector<HTMLButtonElement>('#builder-create-confirm')!.addEventListener('click', () => {
      const name = ctx.panel.querySelector<HTMLInputElement>('#builder-new-name')!.value.trim();
      const description = ctx.panel.querySelector<HTMLTextAreaElement>('#builder-new-desc')!.value.trim();
      if (!name || !description) {
        errorEl.textContent = '이름과 설명을 모두 입력하세요.';
        return;
      }

      let target: Point;
      if (willLink) {
        const direction = ctx.panel.querySelector<HTMLSelectElement>('#builder-new-direction')!.value as CardinalDirection;
        const offset = CARDINAL_OFFSET[direction];
        target = { x: anchor!.x + offset.dx, y: anchor!.y + offset.dy };
      } else {
        target = computeFreeCell(ctx);
      }

      if (ctx.selectedZoneId === null) {
        errorEl.textContent = '존을 먼저 선택하세요.';
        return;
      }

      createBuilderRoom(ctx.token, name, description, target.x, target.y, ctx.selectedZoneId)
        .then((result) => {
          ctx.selectedRoomId = result.room.id;
          ctx.panelMode = 'edit';
          return ctx.refresh();
        })
        .then(() => refreshRoomOptions(ctx))
        .catch((error: unknown) => {
          errorEl.textContent = error instanceof Error ? error.message : '방 생성에 실패했습니다.';
        });
    });
    return;
  }

  if (ctx.panelMode === 'edit' && ctx.selectedRoomId !== null) {
    const room = findRoom(ctx, ctx.selectedRoomId);
    if (!room) {
      ctx.panelMode = 'empty';
      renderPanel(ctx);
      return;
    }

    ctx.panel.innerHTML = `
      <h3>방 편집</h3>
      ${fieldRow('이름', '<input id="builder-edit-name" type="text" maxlength="50" />')}
      ${fieldRow('설명', '<textarea id="builder-edit-desc" maxlength="500" rows="4"></textarea>')}
      <p class="builder-error" id="builder-edit-error"></p>
      <div class="builder-form-row">
        <button type="button" id="builder-edit-save">저장</button>
      </div>

      <h4>출구</h4>
      <p class="builder-panel-hint">출구는 지도에서 방을 드래그해 인접시키거나 떨어뜨려서 관리합니다. 화살표를 클릭하면 해당 방향을 막거나 열 수 있습니다.</p>

      <h4>연결점 (포털)</h4>
      <p class="builder-panel-hint">그리드 인접과 무관하게, 이 방에서 다른 방(다른 존 포함)으로 바로 이동할 수 있는 연결점을 만듭니다.</p>
      <div id="builder-panel-portals"></div>

      <div id="builder-panel-placement"></div>

      <div class="builder-form-row">
        <button type="button" id="builder-room-delete">방 삭제</button>
      </div>
    `;

    ctx.panel.querySelector<HTMLInputElement>('#builder-edit-name')!.value = room.name;
    ctx.panel.querySelector<HTMLTextAreaElement>('#builder-edit-desc')!.value = room.description;

    const errorEl = ctx.panel.querySelector<HTMLParagraphElement>('#builder-edit-error')!;

    ctx.panel.querySelector<HTMLButtonElement>('#builder-edit-save')!.addEventListener('click', () => {
      const name = ctx.panel.querySelector<HTMLInputElement>('#builder-edit-name')!.value.trim();
      const description = ctx.panel.querySelector<HTMLTextAreaElement>('#builder-edit-desc')!.value.trim();
      if (!name || !description) {
        errorEl.textContent = '이름과 설명을 모두 입력하세요.';
        return;
      }
      updateBuilderRoom(ctx.token, room.id, { name, description })
        .then(() => ctx.refresh())
        .catch((error: unknown) => {
          errorEl.textContent = error instanceof Error ? error.message : '수정에 실패했습니다.';
        });
    });

    ctx.panel.querySelector<HTMLButtonElement>('#builder-room-delete')!.addEventListener('click', () => {
      if (!confirm(`"${room.name}" 방을 삭제할까요? 연결된 출구도 함께 제거됩니다.`)) return;
      deleteBuilderRoom(ctx.token, room.id)
        .then(() => {
          ctx.selectedRoomId = null;
          ctx.panelMode = 'empty';
          return ctx.refresh();
        })
        .then(() => refreshRoomOptions(ctx))
        .catch((error: unknown) => {
          errorEl.textContent = error instanceof Error ? error.message : '삭제에 실패했습니다.';
        });
    });

    renderPortalSection(ctx, room);
    return;
  }

  ctx.panel.innerHTML = '<p class="builder-panel-empty">방을 선택하세요.</p>';
}

function renderPortalSection(ctx: BuilderContext, room: BuilderRoomDto): void {
  const portalPanel = ctx.panel.querySelector<HTMLDivElement>('#builder-panel-portals');
  if (!portalPanel) return;

  const portalExits = room.exits.filter((exit) => !CARDINAL_SET.has(exit.direction));

  const groupedOptions = new Map<string, RoomOptionAllZonesDto[]>();
  for (const option of ctx.allRoomOptions) {
    const list = groupedOptions.get(option.zoneName) ?? [];
    list.push(option);
    groupedOptions.set(option.zoneName, list);
  }
  const targetSelectHtml = [...groupedOptions.entries()]
    .map(
      ([zoneName, options]) => `
        <optgroup label="${escapeHtml(zoneName)}">
          ${options.map((option) => `<option value="${option.id}">${escapeHtml(option.name)}</option>`).join('')}
        </optgroup>
      `,
    )
    .join('');

  portalPanel.innerHTML = `
    <ul class="builder-palette-list">
      ${
        portalExits
          .map((exit) => {
            const target = ctx.allRoomOptions.find((option) => option.id === exit.targetRoomId);
            const targetLabel = target
              ? `${escapeHtml(target.name)} (${escapeHtml(target.zoneName)})`
              : `#${exit.targetRoomId}`;
            return `
              <li>
                <span>${escapeHtml(exit.direction)} → ${targetLabel}</span>
                <button type="button" class="builder-exit-delete" data-remove-portal="${escapeHtml(exit.direction)}">제거</button>
              </li>
            `;
          })
          .join('') || '<li class="builder-panel-empty">연결점이 없습니다.</li>'
      }
    </ul>
    <div class="builder-form-row">
      <div class="builder-field">
        <label for="builder-portal-label">이름</label>
        <input id="builder-portal-label" type="text" maxlength="30" placeholder="예: 지하미궁행 포털" />
      </div>
      <div class="builder-field">
        <label for="builder-portal-target">대상 방</label>
        <select id="builder-portal-target">${targetSelectHtml}</select>
      </div>
      <div class="builder-field">
        <label for="builder-portal-return-label">왕복 이름 (선택)</label>
        <input id="builder-portal-return-label" type="text" maxlength="30" placeholder="비우면 편도" />
      </div>
      <button type="button" id="builder-portal-add">연결점 추가</button>
    </div>
    <p class="builder-error" id="builder-portal-error"></p>
  `;

  portalPanel.querySelectorAll<HTMLButtonElement>('[data-remove-portal]').forEach((button) => {
    button.addEventListener('click', () => {
      removeRoomExit(ctx.token, room.id, button.dataset.removePortal!)
        .then(() => ctx.refresh())
        .catch((error: unknown) => {
          showToolbarError(ctx, error instanceof Error ? error.message : '연결점 제거에 실패했습니다.');
        });
    });
  });

  const portalErrorEl = portalPanel.querySelector<HTMLParagraphElement>('#builder-portal-error')!;
  portalPanel.querySelector<HTMLButtonElement>('#builder-portal-add')?.addEventListener('click', () => {
    const label = portalPanel.querySelector<HTMLInputElement>('#builder-portal-label')!.value.trim();
    const targetSelect = portalPanel.querySelector<HTMLSelectElement>('#builder-portal-target')!;
    const targetRoomId = Number(targetSelect.value);
    const returnLabel = portalPanel.querySelector<HTMLInputElement>('#builder-portal-return-label')!.value.trim();

    if (!label || !targetRoomId) {
      portalErrorEl.textContent = '이름과 대상 방을 입력하세요.';
      return;
    }

    addRoomExit(ctx.token, room.id, label, targetRoomId, returnLabel || undefined)
      .then(() => ctx.refresh())
      .catch((error: unknown) => {
        portalErrorEl.textContent = error instanceof Error ? error.message : '연결점 추가에 실패했습니다.';
      });
  });
}
