import { ITEM_GRADE_LABELS, ITEM_GRADE_VALUES, EQUIPMENT_SLOT_LABELS, type ItemGrade } from '@mud/shared';
import { createItemTemplate, deleteItemTemplate, fetchItemTemplates, updateItemTemplate, type ItemTemplateDto } from '../../adminApi';
import { escapeHtml } from '../../domUtils';
import { ITEM_TYPE_LABELS, type AdminContext } from './context';

function renderItemGradeTabs(ctx: AdminContext): void {
  ctx.itemGradeTabs.innerHTML = ITEM_GRADE_VALUES.map((grade) => {
    const count = ctx.itemTemplates.filter((item) => item.grade === grade).length;
    return `<button type="button" class="admin-tab-btn${grade === ctx.selectedItemGrade ? ' active' : ''}" data-grade="${grade}">${ITEM_GRADE_LABELS[grade]} (${count})</button>`;
  }).join('');

  ctx.itemGradeTabs.querySelectorAll<HTMLButtonElement>('.admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      ctx.selectedItemGrade = btn.dataset.grade as ItemGrade;
      renderItemGradeTabs(ctx);
      renderItemList(ctx);
    });
  });
}

function fillItemForm(ctx: AdminContext, item: ItemTemplateDto): void {
  ctx.container.querySelector<HTMLInputElement>('#admin-item-name')!.value = item.name;
  ctx.container.querySelector<HTMLInputElement>('#admin-item-desc')!.value = item.description;
  ctx.container.querySelector<HTMLSelectElement>('#admin-item-type')!.value = item.type;
  ctx.container.querySelector<HTMLSelectElement>('#admin-item-slot')!.value = item.slot ?? '';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-level')!.value = String(item.level);
  ctx.container.querySelector<HTMLSelectElement>('#admin-item-grade')!.value = item.grade;
  ctx.container.querySelector<HTMLInputElement>('#admin-item-str')!.value = String(item.strengthBonus);
  ctx.container.querySelector<HTMLInputElement>('#admin-item-dex')!.value = String(item.dexterityBonus);
  ctx.container.querySelector<HTMLInputElement>('#admin-item-attack')!.value = String(item.attackPowerBonus);
  ctx.container.querySelector<HTMLInputElement>('#admin-item-int')!.value = String(item.intelligenceBonus);
  ctx.container.querySelector<HTMLInputElement>('#admin-item-pdef')!.value = String(item.physicalDefenseBonus);
  ctx.container.querySelector<HTMLInputElement>('#admin-item-mdef')!.value = String(item.magicDefenseBonus);
  ctx.container.querySelector<HTMLInputElement>('#admin-item-heal')!.value = String(item.healAmount);
  ctx.container.querySelector<HTMLInputElement>('#admin-item-mana')!.value = String(item.manaAmount);
  ctx.container.querySelector<HTMLInputElement>('#admin-item-value')!.value = String(item.value);
}

function resetItemForm(ctx: AdminContext): void {
  ctx.editingItemId = null;
  ctx.itemCreateBtn.textContent = '아이템 생성';
  ctx.itemCancelBtn.hidden = true;
  ctx.itemError.textContent = '';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-name')!.value = '';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-desc')!.value = '';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-level')!.value = '1';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-str')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-dex')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-attack')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-int')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-pdef')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-mdef')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-heal')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-mana')!.value = '0';
  ctx.container.querySelector<HTMLInputElement>('#admin-item-value')!.value = '0';
}

function itemStatSummary(item: ItemTemplateDto): string {
  const stats: string[] = [];
  if (item.attackPowerBonus) stats.push(`공격력 +${item.attackPowerBonus}`);
  if (item.intelligenceBonus) stats.push(`지능 +${item.intelligenceBonus}`);
  if (item.strengthBonus) stats.push(`힘 +${item.strengthBonus}`);
  if (item.dexterityBonus) stats.push(`민첩 +${item.dexterityBonus}`);
  if (item.physicalDefenseBonus) stats.push(`물리방어 +${item.physicalDefenseBonus}`);
  if (item.magicDefenseBonus) stats.push(`마법방어 +${item.magicDefenseBonus}`);
  if (item.healAmount) stats.push(`회복 +${item.healAmount}`);
  if (item.manaAmount) stats.push(`마나회복 +${item.manaAmount}`);
  return stats.length ? `, ${stats.join(', ')}` : '';
}

function renderItemList(ctx: AdminContext): void {
  const items = ctx.itemTemplates.filter((item) => item.grade === ctx.selectedItemGrade);

  ctx.itemTemplatesList.innerHTML =
    items
      .map(
        (item) => `
          <li>
            <span><span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> (${ITEM_TYPE_LABELS[item.type] ?? item.type}${item.slot ? `, ${EQUIPMENT_SLOT_LABELS[item.slot]}` : ''}, Lv.${item.level}, ${ITEM_GRADE_LABELS[item.grade]}, 가치 ${item.value}${itemStatSummary(item)})</span>
            <span class="admin-row-actions">
              <button type="button" class="admin-edit-btn" data-item-id="${item.id}">수정</button>
              <button type="button" class="admin-delete-btn" data-item-id="${item.id}">삭제</button>
            </span>
          </li>
        `,
      )
      .join('') || '<li class="admin-panel-empty">이 등급의 아이템이 없습니다.</li>';

  ctx.itemTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = ctx.itemTemplates.find((entry) => entry.id === Number(btn.dataset.itemId));
      if (!item) return;
      ctx.editingItemId = item.id;
      fillItemForm(ctx, item);
      ctx.itemCreateBtn.textContent = '저장';
      ctx.itemCancelBtn.hidden = false;
      ctx.itemError.textContent = '';
    });
  });

  ctx.itemTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = ctx.itemTemplates.find((entry) => entry.id === Number(btn.dataset.itemId));
      if (!item) return;
      if (!confirm(`"${item.name}" 아이템을 삭제할까요?`)) return;
      deleteItemTemplate(ctx.token, item.id)
        .then(() => {
          if (ctx.editingItemId === item.id) resetItemForm(ctx);
          return refreshItems(ctx);
        })
        .catch((error: unknown) => {
          ctx.itemError.textContent = error instanceof Error ? error.message : '아이템 삭제에 실패했습니다.';
        });
    });
  });
}

export async function refreshItems(ctx: AdminContext): Promise<void> {
  const { items } = await fetchItemTemplates(ctx.token);
  ctx.itemTemplates = items;
  renderItemGradeTabs(ctx);
  renderItemList(ctx);
}

export function wireItemForm(ctx: AdminContext): void {
  ctx.itemCreateBtn.addEventListener('click', () => {
    const name = ctx.container.querySelector<HTMLInputElement>('#admin-item-name')!.value.trim();
    const description = ctx.container.querySelector<HTMLInputElement>('#admin-item-desc')!.value.trim();
    const type = ctx.container.querySelector<HTMLSelectElement>('#admin-item-type')!.value;
    const slot = ctx.container.querySelector<HTMLSelectElement>('#admin-item-slot')!.value;
    const level = Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-level')!.value);
    const grade = ctx.container.querySelector<HTMLSelectElement>('#admin-item-grade')!.value as ItemGrade;
    ctx.itemError.textContent = '';
    if (!name || !description) {
      ctx.itemError.textContent = '이름과 설명을 입력하세요.';
      return;
    }
    const data = {
      name,
      description,
      type,
      slot: slot ? (slot as ItemTemplateDto['slot']) : null,
      level,
      grade,
      strengthBonus: Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-str')!.value),
      dexterityBonus: Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-dex')!.value),
      attackPowerBonus: Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-attack')!.value),
      intelligenceBonus: Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-int')!.value),
      physicalDefenseBonus: Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-pdef')!.value),
      magicDefenseBonus: Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-mdef')!.value),
      healAmount: Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-heal')!.value),
      manaAmount: Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-mana')!.value),
      value: Number(ctx.container.querySelector<HTMLInputElement>('#admin-item-value')!.value),
    };
    const request = ctx.editingItemId
      ? updateItemTemplate(ctx.token, ctx.editingItemId, data)
      : createItemTemplate(ctx.token, data);
    request
      .then(() => {
        ctx.selectedItemGrade = grade;
        resetItemForm(ctx);
        return refreshItems(ctx);
      })
      .catch((error: unknown) => {
        ctx.itemError.textContent = error instanceof Error ? error.message : '아이템 저장에 실패했습니다.';
      });
  });

  ctx.itemCancelBtn.addEventListener('click', () => resetItemForm(ctx));
}
