import { ELEMENT_LABELS, ITEM_GRADE_DROP_WEIGHT, ITEM_GRADE_LABELS, type ElementType } from '@mud/shared';
import {
  addMobLootPoolItem,
  createMobTemplate,
  deleteMobTemplate,
  fetchAllMobLootPools,
  fetchMobLootPool,
  fetchMobTemplates,
  removeMobLootPoolItem,
  updateMobTemplate,
  type MobLootPoolEntryDto,
  type MobTemplateDto,
} from '../../adminApi';
import { escapeHtml } from '../../domUtils';
import { DAMAGE_TYPE_LABELS, type AdminContext } from './context';

/** 몹 수정 폼을 표에서 빼내 원래 위치(표 바로 아래)로 되돌린다. */
function parkMobFormAtDefault(ctx: AdminContext): void {
  ctx.container.querySelector('.admin-mob-edit-row')?.remove();
  ctx.mobFormSlot.insertAdjacentElement('afterend', ctx.mobFormContainer);
}

/** 몹 수정 폼을 표에서 해당 몹의 행 바로 아래로 옮긴다. */
function moveMobFormBelowRow(ctx: AdminContext, row: HTMLTableRowElement): void {
  ctx.container.querySelector('.admin-mob-edit-row')?.remove();
  const editRow = document.createElement('tr');
  editRow.className = 'admin-mob-edit-row';
  const cell = document.createElement('td');
  cell.colSpan = 7;
  editRow.appendChild(cell);
  row.insertAdjacentElement('afterend', editRow);
  cell.appendChild(ctx.mobFormContainer);
}

function fillMobForm(ctx: AdminContext, mob: MobTemplateDto): void {
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-name')!.value = mob.name;
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-hp')!.value = String(mob.hp);
  ctx.mobElementSelect.value = mob.element;
  ctx.container.querySelector<HTMLSelectElement>('#admin-mob-damage-type')!.value = mob.damageType;
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-level')!.value = String(mob.level);
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-hostile')!.checked = mob.hostile;
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-str')!.value = String(mob.strength);
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-dex')!.value = String(mob.dexterity);
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-pdef')!.value = String(mob.physicalDefense);
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-mdef')!.value = String(mob.magicDefense);
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-exp')!.value = String(mob.expReward);
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-gold')!.value = String(mob.goldReward);
}

function resetMobForm(ctx: AdminContext): void {
  ctx.editingMobId = null;
  ctx.mobCreateBtn.textContent = '몬스터 생성';
  ctx.mobCancelBtn.hidden = true;
  ctx.mobError.textContent = '';
  parkMobFormAtDefault(ctx);
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-name')!.value = '';
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-hp')!.value = '10';
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-level')!.value = '1';
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-hostile')!.checked = true;
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-str')!.value = '1';
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-dex')!.value = '1';
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-pdef')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-mdef')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-exp')!.value = '5';
  ctx.container.querySelector<HTMLInputElement>('#admin-mob-gold')!.value = '1';
  ctx.pendingLootWeights = new Map();
}

function renderMobTemplatesList(ctx: AdminContext, lootEntries: MobLootPoolEntryDto[]): void {
  const lootByMobId = new Map<number, MobLootPoolEntryDto[]>();
  for (const entry of lootEntries) {
    const list = lootByMobId.get(entry.mobTemplateId) ?? [];
    list.push(entry);
    lootByMobId.set(entry.mobTemplateId, list);
  }

  ctx.mobTemplatesList.innerHTML =
    ctx.mobTemplates
      .map((mob) => {
        const loot = lootByMobId.get(mob.id) ?? [];
        const lootText = loot
          .map((entry) => `<span class="item-grade-${entry.grade}">${escapeHtml(entry.name)}</span>(${entry.weight}%)`)
          .join(', ');
        return `
          <tr data-mob-id="${mob.id}">
            <td>${escapeHtml(mob.name)}${mob.hostile ? '' : ' <span class="admin-mob-passive-tag">비전투</span>'}</td>
            <td>${mob.level}</td>
            <td>${mob.hp}</td>
            <td>${ELEMENT_LABELS[mob.element]}</td>
            <td>${DAMAGE_TYPE_LABELS[mob.damageType]}</td>
            <td class="admin-mob-loot-cell">${lootText || '-'}</td>
            <td>
              <span class="admin-row-actions">
                <button type="button" class="admin-edit-btn" data-mob-id="${mob.id}">수정</button>
                <button type="button" class="admin-delete-btn" data-mob-id="${mob.id}">삭제</button>
              </span>
            </td>
          </tr>
        `;
      })
      .join('') || '<tr><td colspan="7" class="admin-panel-empty">없음</td></tr>';

  ctx.mobTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mob = ctx.mobTemplates.find((entry) => entry.id === Number(btn.dataset.mobId));
      if (!mob) return;
      ctx.editingMobId = mob.id;
      fillMobForm(ctx, mob);
      ctx.mobCreateBtn.textContent = '저장';
      ctx.mobCancelBtn.hidden = false;
      ctx.mobError.textContent = '';
      const row = btn.closest<HTMLTableRowElement>('tr');
      if (row) moveMobFormBelowRow(ctx, row);
      refreshMobLootPool(ctx).catch((error: unknown) => {
        ctx.mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀을 불러오지 못했습니다.';
      });
    });
  });

  ctx.mobTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mob = ctx.mobTemplates.find((entry) => entry.id === Number(btn.dataset.mobId));
      if (!mob) return;
      if (!confirm(`"${mob.name}" 몬스터를 삭제할까요?`)) return;
      deleteMobTemplate(ctx.token, mob.id)
        .then(() => {
          if (ctx.editingMobId === mob.id) resetMobForm(ctx);
          return refreshMobs(ctx);
        })
        .catch((error: unknown) => {
          ctx.mobError.textContent = error instanceof Error ? error.message : '몬스터 삭제에 실패했습니다.';
        });
    });
  });

  if (ctx.editingMobId !== null) {
    const row = ctx.mobTemplatesList.querySelector<HTMLTableRowElement>(`tr[data-mob-id="${ctx.editingMobId}"]`);
    if (row) moveMobFormBelowRow(ctx, row);
  }
}

async function refreshMobLootSummaries(ctx: AdminContext): Promise<void> {
  const { items: lootEntries } = await fetchAllMobLootPools(ctx.token);
  renderMobTemplatesList(ctx, lootEntries);
}

export async function refreshMobs(ctx: AdminContext): Promise<void> {
  const [{ mobTemplates: fetched }, { items: lootEntries }] = await Promise.all([
    fetchMobTemplates(ctx.token),
    fetchAllMobLootPools(ctx.token),
  ]);
  ctx.mobTemplates = fetched;
  renderMobTemplatesList(ctx, lootEntries);

  await refreshMobLootPool(ctx);
}

/**
 * 편집 중인 몬스터가 있으면 그 몬스터의 실제 보유 아이템 풀을(서버에 바로 반영하며) 보여주고,
 * 새 몬스터를 만드는 중이면 아직 저장되지 않은 로컬 선택(pendingLootWeights)만 보여준다.
 * 두 경우 모두 레벨 입력창에 현재 입력된 값 기준으로 아이템을 필터링한다.
 */
export async function refreshMobLootPool(ctx: AdminContext): Promise<void> {
  ctx.mobLootError.textContent = '';
  const level = Number(ctx.mobLevelInput.value) || 1;
  const eligibleItems = ctx.itemTemplates.filter((item) => item.level <= level);

  const poolWeights = ctx.editingMobId
    ? new Map<number, number>((await fetchMobLootPool(ctx.token, ctx.editingMobId)).items.map((item) => [item.id, item.weight]))
    : ctx.pendingLootWeights;

  ctx.mobLootItemsList.innerHTML =
    eligibleItems
      .map((item) => {
        const inPool = poolWeights.has(item.id);
        const weight = poolWeights.get(item.id) ?? ITEM_GRADE_DROP_WEIGHT[item.grade];
        return `
          <li>
            <label class="admin-checkbox-label">
              <input type="checkbox" class="admin-mob-loot-toggle" data-item-id="${item.id}" ${inPool ? 'checked' : ''} />
              <span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> (${ITEM_GRADE_LABELS[item.grade]})
            </label>
            <input
              type="number"
              class="admin-mob-loot-weight"
              data-item-id="${item.id}"
              value="${weight}"
              min="1"
              title="드랍 가중치. 값이 클수록 이 몬스터가 이 아이템을 더 자주 보유합니다."
              ${inPool ? '' : 'disabled'}
            />
          </li>
        `;
      })
      .join('') || `<li class="admin-panel-empty">${ctx.itemTemplates.length === 0 ? '생성된 아이템이 없습니다.' : `${level}레벨 이하 아이템이 없습니다.`}</li>`;

  ctx.mobLootItemsList.querySelectorAll<HTMLInputElement>('.admin-mob-loot-toggle').forEach((checkbox) => {
    const weightInput = ctx.mobLootItemsList.querySelector<HTMLInputElement>(
      `.admin-mob-loot-weight[data-item-id="${checkbox.dataset.itemId}"]`,
    )!;
    checkbox.addEventListener('change', () => {
      const itemId = Number(checkbox.dataset.itemId);
      weightInput.disabled = !checkbox.checked;
      if (!ctx.editingMobId) {
        if (checkbox.checked) ctx.pendingLootWeights.set(itemId, Number(weightInput.value));
        else ctx.pendingLootWeights.delete(itemId);
        return;
      }
      const action = checkbox.checked
        ? addMobLootPoolItem(ctx.token, ctx.editingMobId, itemId, Number(weightInput.value))
        : removeMobLootPoolItem(ctx.token, ctx.editingMobId, itemId);
      action
        .then(() => refreshMobLootSummaries(ctx))
        .catch((error: unknown) => {
          ctx.mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀 변경에 실패했습니다.';
          checkbox.checked = !checkbox.checked;
          weightInput.disabled = !checkbox.checked;
        });
    });
  });

  ctx.mobLootItemsList.querySelectorAll<HTMLInputElement>('.admin-mob-loot-weight').forEach((weightInput) => {
    weightInput.addEventListener('change', () => {
      const itemId = Number(weightInput.dataset.itemId);
      const weight = Number(weightInput.value);
      if (!ctx.editingMobId) {
        if (ctx.pendingLootWeights.has(itemId)) ctx.pendingLootWeights.set(itemId, weight);
        return;
      }
      addMobLootPoolItem(ctx.token, ctx.editingMobId, itemId, weight)
        .then(() => refreshMobLootSummaries(ctx))
        .catch((error: unknown) => {
          ctx.mobLootError.textContent = error instanceof Error ? error.message : '가중치 변경에 실패했습니다.';
        });
    });
  });
}

export function wireMobForm(ctx: AdminContext): void {
  ctx.mobCreateBtn.addEventListener('click', () => {
    const name = ctx.container.querySelector<HTMLInputElement>('#admin-mob-name')!.value.trim();
    ctx.mobError.textContent = '';
    if (!name) {
      ctx.mobError.textContent = '이름을 입력하세요.';
      return;
    }
    const data = {
      hp: Number(ctx.container.querySelector<HTMLInputElement>('#admin-mob-hp')!.value),
      strength: Number(ctx.container.querySelector<HTMLInputElement>('#admin-mob-str')!.value),
      dexterity: Number(ctx.container.querySelector<HTMLInputElement>('#admin-mob-dex')!.value),
      physicalDefense: Number(ctx.container.querySelector<HTMLInputElement>('#admin-mob-pdef')!.value),
      magicDefense: Number(ctx.container.querySelector<HTMLInputElement>('#admin-mob-mdef')!.value),
      element: ctx.mobElementSelect.value as ElementType,
      damageType: ctx.container.querySelector<HTMLSelectElement>('#admin-mob-damage-type')!.value as 'physical' | 'magic',
      expReward: Number(ctx.container.querySelector<HTMLInputElement>('#admin-mob-exp')!.value),
      goldReward: Number(ctx.container.querySelector<HTMLInputElement>('#admin-mob-gold')!.value),
      level: Number(ctx.container.querySelector<HTMLInputElement>('#admin-mob-level')!.value),
      hostile: ctx.container.querySelector<HTMLInputElement>('#admin-mob-hostile')!.checked,
      name,
    };
    const wasCreating = !ctx.editingMobId;
    const pending = [...ctx.pendingLootWeights.entries()];
    const request = ctx.editingMobId ? updateMobTemplate(ctx.token, ctx.editingMobId, data) : createMobTemplate(ctx.token, data);
    request
      .then(async (result) => {
        if (wasCreating && pending.length > 0) {
          const newMobId = result.mobTemplate.id;
          await Promise.all(pending.map(([itemId, weight]) => addMobLootPoolItem(ctx.token, newMobId, itemId, weight)));
        }
        resetMobForm(ctx);
        return refreshMobs(ctx);
      })
      .catch((error: unknown) => {
        ctx.mobError.textContent = error instanceof Error ? error.message : '몬스터 저장에 실패했습니다.';
      });
  });

  ctx.mobCancelBtn.addEventListener('click', () => {
    resetMobForm(ctx);
    refreshMobLootPool(ctx).catch((error: unknown) => {
      ctx.mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀을 불러오지 못했습니다.';
    });
  });

  ctx.mobLevelInput.addEventListener('input', () => {
    refreshMobLootPool(ctx).catch((error: unknown) => {
      ctx.mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀을 불러오지 못했습니다.';
    });
  });
}
