import { ITEM_GRADE_LABELS, ITEM_GRADE_VALUES, type ItemGrade } from '@mud/shared';
import {
  fetchBuilderItemTemplates,
  fetchBuilderMobSpawns,
  fetchBuilderMobTemplates,
  fetchBuilderNpcSpawns,
  fetchBuilderNpcTemplates,
  fetchBuilderRoomItems,
  placeBuilderMobSpawn,
  placeBuilderNpcSpawn,
  placeBuilderRoomItem,
  removeBuilderMobSpawn,
  removeBuilderNpcSpawn,
  removeBuilderRoomItem,
  type BuilderRoomDto,
} from '../../builderApi';
import { escapeHtml } from '../../domUtils';
import { findRoom, PLACEHOLDER_OWNED_QTY, showToolbarError, type BuilderContext } from './context';

export async function refreshPalette(ctx: BuilderContext): Promise<void> {
  const [itemsResult, mobTemplatesResult, roomItemsResult, mobSpawnsResult, npcTemplatesResult, npcSpawnsResult] =
    await Promise.all([
      fetchBuilderItemTemplates(ctx.token),
      fetchBuilderMobTemplates(ctx.token),
      fetchBuilderRoomItems(ctx.token),
      fetchBuilderMobSpawns(ctx.token),
      fetchBuilderNpcTemplates(ctx.token),
      fetchBuilderNpcSpawns(ctx.token),
    ]);
  ctx.itemTemplates = itemsResult.items;
  ctx.mobTemplates = mobTemplatesResult.mobTemplates;
  ctx.roomItems = roomItemsResult.roomItems;
  ctx.mobSpawns = mobSpawnsResult.mobSpawns;
  ctx.npcTemplates = npcTemplatesResult.npcTemplates;
  ctx.npcSpawns = npcSpawnsResult.npcSpawns;
  renderPalette(ctx);
}

export function renderPalette(ctx: BuilderContext): void {
  const room = ctx.selectedRoomId !== null ? findRoom(ctx, ctx.selectedRoomId) : undefined;

  const roomHint = room
    ? `<p class="builder-panel-hint">"${escapeHtml(room.name)}"에 배치합니다.</p>`
    : '<p class="builder-panel-hint">방을 선택하면 아이템과 몹을 배치할 수 있습니다.</p>';

  ctx.palette.innerHTML = `
    <h3>보유 아이템</h3>
    ${roomHint}
    <div class="builder-item-groups">
      ${
        ITEM_GRADE_VALUES.map((grade) => {
          const items = ctx.itemTemplates.filter((item) => item.grade === grade);
          if (items.length === 0) return '';
          const expanded = ctx.expandedItemGrades.has(grade);
          return `
            <div class="builder-item-group">
              <button type="button" class="builder-item-group-header" data-toggle-grade="${grade}">
                <span class="builder-item-group-caret">${expanded ? '▾' : '▸'}</span>
                <span class="item-grade-${grade}">${ITEM_GRADE_LABELS[grade]}</span>
                <span class="builder-item-group-count">${items.length}</span>
              </button>
              ${
                expanded
                  ? `<ul class="builder-palette-list">
                      ${items
                        .map(
                          (item) => `
                            <li>
                              <span class="builder-palette-name"><span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> <span class="builder-palette-qty">x${PLACEHOLDER_OWNED_QTY}</span></span>
                              <div class="builder-palette-actions">
                                <input type="number" class="builder-palette-num-input" data-item-qty="${item.id}" value="1" min="1" />
                                <button type="button" data-place-item="${item.id}" ${room ? '' : 'disabled'}>배치</button>
                              </div>
                            </li>
                          `,
                        )
                        .join('')}
                    </ul>`
                  : ''
              }
            </div>
          `;
        }).join('') || '<p class="builder-panel-empty">등록된 아이템이 없습니다.</p>'
      }
    </div>

    <h3>보유 몹 / NPC</h3>
    <p class="builder-panel-hint">몹 목록에서 "적대적" 옵션을 끈 몹은 상점 주인 같은 비전투 NPC로 동작합니다.</p>
    <ul class="builder-palette-list">
      ${
        ctx.mobTemplates
          .map(
            (mob) => `
              <li>
                <span class="builder-palette-name">${escapeHtml(mob.name)} <span class="builder-palette-qty">x${PLACEHOLDER_OWNED_QTY}</span></span>
                <div class="builder-palette-actions">
                  <input type="number" class="builder-palette-num-input" data-mob-respawn="${mob.id}" value="20" min="5" />
                  <button type="button" data-place-mob="${mob.id}" ${room ? '' : 'disabled'}>배치</button>
                </div>
              </li>
            `,
          )
          .join('') || '<li class="builder-panel-empty">등록된 몹이 없습니다.</li>'
      }
    </ul>

    <h3>보유 NPC</h3>
    <ul class="builder-palette-list">
      ${
        ctx.npcTemplates
          .map(
            (npc) => `
              <li>
                <span class="builder-palette-name">${escapeHtml(npc.name)} <span class="builder-palette-qty">x${PLACEHOLDER_OWNED_QTY}</span></span>
                <div class="builder-palette-actions">
                  <button type="button" data-place-npc="${npc.id}" ${room ? '' : 'disabled'}>배치</button>
                </div>
              </li>
            `,
          )
          .join('') || '<li class="builder-panel-empty">등록된 NPC가 없습니다.</li>'
      }
    </ul>
  `;

  ctx.palette.querySelectorAll<HTMLButtonElement>('[data-toggle-grade]').forEach((button) => {
    button.addEventListener('click', () => {
      const grade = button.dataset.toggleGrade as ItemGrade;
      if (ctx.expandedItemGrades.has(grade)) {
        ctx.expandedItemGrades.delete(grade);
      } else {
        ctx.expandedItemGrades.add(grade);
      }
      renderPalette(ctx);
    });
  });

  ctx.palette.querySelectorAll<HTMLButtonElement>('[data-place-item]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!room) return;
      const itemId = Number(button.dataset.placeItem);
      const qtyInput = ctx.palette.querySelector<HTMLInputElement>(`[data-item-qty="${itemId}"]`)!;
      const quantity = Number(qtyInput.value) || 1;
      placeBuilderRoomItem(ctx.token, room.id, itemId, quantity)
        .then(() => refreshPalette(ctx))
        .catch((error: unknown) => {
          showToolbarError(ctx, error instanceof Error ? error.message : '배치에 실패했습니다.');
        });
    });
  });

  ctx.palette.querySelectorAll<HTMLButtonElement>('[data-place-mob]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!room) return;
      const mobTemplateId = Number(button.dataset.placeMob);
      const respawnInput = ctx.palette.querySelector<HTMLInputElement>(`[data-mob-respawn="${mobTemplateId}"]`)!;
      const respawnSeconds = Number(respawnInput.value) || 20;
      placeBuilderMobSpawn(ctx.token, room.id, mobTemplateId, respawnSeconds)
        .then(() => refreshPalette(ctx))
        .catch((error: unknown) => {
          showToolbarError(ctx, error instanceof Error ? error.message : '배치에 실패했습니다.');
        });
    });
  });

  ctx.palette.querySelectorAll<HTMLButtonElement>('[data-place-npc]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!room) return;
      const npcTemplateId = Number(button.dataset.placeNpc);
      placeBuilderNpcSpawn(ctx.token, room.id, npcTemplateId)
        .then(() => refreshPalette(ctx))
        .catch((error: unknown) => {
          showToolbarError(ctx, error instanceof Error ? error.message : '배치에 실패했습니다.');
        });
    });
  });

  renderPlacedInRoom(ctx, room);
}

function renderPlacedInRoom(ctx: BuilderContext, room: BuilderRoomDto | undefined): void {
  const placement = ctx.panel.querySelector<HTMLDivElement>('#builder-panel-placement');
  if (!placement || !room) return;

  const placedItems = ctx.roomItems.filter((row) => row.roomId === room.id);
  const placedMobs = ctx.mobSpawns.filter((row) => row.roomId === room.id);
  const placedNpcs = ctx.npcSpawns.filter((row) => row.roomId === room.id);

  placement.innerHTML = `
    <h4>이 방에 배치된 아이템</h4>
    <ul class="builder-palette-list">
      ${
        placedItems
          .map(
            (row) => `
                  <li>
                    <span><span class="item-grade-${row.itemGrade}">${escapeHtml(row.itemName)}</span> x${row.quantity}</span>
                    <button type="button" class="builder-exit-delete" data-remove-item="${row.id}">제거</button>
                  </li>
                `,
          )
          .join('') || '<li class="builder-panel-empty">배치된 아이템이 없습니다.</li>'
      }
    </ul>

    <h4>이 방에 배치된 몹</h4>
    <ul class="builder-palette-list">
      ${
        placedMobs
          .map(
            (row) => `
                  <li>
                    <span>${escapeHtml(row.mobName)} (리스폰 ${row.respawnSeconds}초)</span>
                    <button type="button" class="builder-exit-delete" data-remove-mob="${row.id}">제거</button>
                  </li>
                `,
          )
          .join('') || '<li class="builder-panel-empty">배치된 몹이 없습니다.</li>'
      }
    </ul>

    <h4>이 방에 배치된 NPC</h4>
    <ul class="builder-palette-list">
      ${
        placedNpcs
          .map(
            (row) => `
                  <li>
                    <span>${escapeHtml(row.npcName)}</span>
                    <button type="button" class="builder-exit-delete" data-remove-npc="${row.id}">제거</button>
                  </li>
                `,
          )
          .join('') || '<li class="builder-panel-empty">배치된 NPC가 없습니다.</li>'
      }
    </ul>
  `;

  placement.querySelectorAll<HTMLButtonElement>('[data-remove-item]').forEach((button) => {
    button.addEventListener('click', () => {
      removeBuilderRoomItem(ctx.token, Number(button.dataset.removeItem))
        .then(() => refreshPalette(ctx))
        .catch((error: unknown) => {
          showToolbarError(ctx, error instanceof Error ? error.message : '제거에 실패했습니다.');
        });
    });
  });

  placement.querySelectorAll<HTMLButtonElement>('[data-remove-mob]').forEach((button) => {
    button.addEventListener('click', () => {
      removeBuilderMobSpawn(ctx.token, Number(button.dataset.removeMob))
        .then(() => refreshPalette(ctx))
        .catch((error: unknown) => {
          showToolbarError(ctx, error instanceof Error ? error.message : '제거에 실패했습니다.');
        });
    });
  });

  placement.querySelectorAll<HTMLButtonElement>('[data-remove-npc]').forEach((button) => {
    button.addEventListener('click', () => {
      removeBuilderNpcSpawn(ctx.token, Number(button.dataset.removeNpc))
        .then(() => refreshPalette(ctx))
        .catch((error: unknown) => {
          showToolbarError(ctx, error instanceof Error ? error.message : '제거에 실패했습니다.');
        });
    });
  });
}
