import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  type ClientMessage,
  type EquipmentSlot,
} from '@mud/shared';
import { escapeHtml } from '../../domUtils';
import type { GameContext } from './context';

export function renderEquipmentPanel(ctx: GameContext): void {
  ctx.equipmentPanel.innerHTML = EQUIPMENT_SLOTS.map((slot) => {
    const equipped = ctx.equipmentState[slot];
    return `
      <div class="equipment-slot">
        <span class="equipment-slot-label">${EQUIPMENT_SLOT_LABELS[slot]}</span>
        <span class="equipment-slot-value">${equipped ? `<span class="item-grade-${equipped.grade}">${escapeHtml(equipped.name)}</span>` : '비어있음'}</span>
      </div>
    `;
  }).join('');
}

export function renderInventoryCount(ctx: GameContext): void {
  const slotsUsed = ctx.inventoryState.filter((item) => item.healAmount <= 0 && item.manaAmount <= 0).length;
  ctx.inventoryCountLabel.textContent = String(slotsUsed);
}

/** 체력만 채우면 ❤, 마나만 채우면 💧, 둘 다 채우는 엘릭서류는 ✨로 구분한다. */
function potionIcon(item: { healAmount: number; manaAmount: number }): string {
  if (item.healAmount > 0 && item.manaAmount > 0) return '✨';
  if (item.manaAmount > 0) return '💧';
  return '❤';
}

/** 물약류(체력/마나 회복 아이템)는 인벤토리 칸을 차지하지 않으므로, 종류와 개수를 따로 모아 보여준다. */
export function renderPotionSummary(ctx: GameContext): void {
  const potions = ctx.inventoryState.filter((item) => item.healAmount > 0 || item.manaAmount > 0);
  if (potions.length === 0) {
    ctx.sidebarPotions.innerHTML = '';
    return;
  }

  ctx.sidebarPotions.innerHTML = `
    <div class="sidebar-potions-title">물약</div>
    ${potions
      .map(
        (item) => `
          <div class="sidebar-potions-row">
            <span class="sidebar-potions-name">
              <span class="sidebar-potions-icon sidebar-potions-icon-${item.healAmount > 0 && item.manaAmount > 0 ? 'elixir' : item.manaAmount > 0 ? 'mana' : 'health'} sidebar-potions-icon-grade-${item.grade}">${potionIcon(item)}</span>
              <span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span>
            </span>
            <span class="sidebar-potions-qty">x${item.quantity}</span>
          </div>
        `,
      )
      .join('')}
  `;
}

export function renderInventoryModal(ctx: GameContext): void {
  ctx.inventoryModalBody.innerHTML =
    ctx.inventoryState
      .map((item) => {
        const canEquip = Boolean(item.slot) && !item.equipped;
        return `
          <div class="inventory-panel-row">
            <div class="inventory-panel-info">
              <span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span>
              <span class="inventory-panel-qty">${item.quantity > 1 ? `x${item.quantity}` : ''}${item.equipped ? ' [장착중]' : ''}</span>
            </div>
            <div class="inventory-panel-actions">
              ${canEquip ? `<button type="button" class="inventory-panel-btn" data-equip-inventory-id="${item.inventoryId}">장착</button>` : ''}
              ${item.equipped ? `<button type="button" class="inventory-panel-btn" data-unequip-slot="${item.slot}">해제</button>` : ''}
              <button
                type="button"
                class="inventory-panel-btn inventory-panel-btn-danger"
                data-drop-inventory-id="${item.inventoryId}"
                ${item.equipped ? 'disabled title="장착 중인 아이템은 버릴 수 없습니다. 먼저 해제하세요."' : ''}
              >버리기</button>
            </div>
          </div>
        `;
      })
      .join('') || '<div class="inventory-panel-empty">비어있음</div>';

  ctx.inventoryModalBody.querySelectorAll<HTMLButtonElement>('[data-equip-inventory-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const inventoryId = Number(button.dataset.equipInventoryId);
      if (!inventoryId) return;
      const message: ClientMessage = { type: 'equipItem', inventoryId };
      ctx.socket.send(JSON.stringify(message));
    });
  });

  ctx.inventoryModalBody.querySelectorAll<HTMLButtonElement>('[data-unequip-slot]').forEach((button) => {
    button.addEventListener('click', () => {
      const slot = button.dataset.unequipSlot as EquipmentSlot;
      const message: ClientMessage = { type: 'unequipItem', slot };
      ctx.socket.send(JSON.stringify(message));
    });
  });

  ctx.inventoryModalBody.querySelectorAll<HTMLButtonElement>('[data-drop-inventory-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const inventoryId = Number(button.dataset.dropInventoryId);
      if (!inventoryId) return;
      const message: ClientMessage = { type: 'dropItem', inventoryId };
      ctx.socket.send(JSON.stringify(message));
    });
  });
}

export function openInventoryModal(ctx: GameContext): void {
  renderInventoryModal(ctx);
  ctx.inventoryModal.hidden = false;
}

export function closeInventoryModal(ctx: GameContext): void {
  ctx.inventoryModal.hidden = true;
}

export function renderEquipModal(ctx: GameContext): void {
  ctx.equipModalBody.innerHTML = EQUIPMENT_SLOTS.map((slot) => {
    const equipped = ctx.equipmentState[slot];
    const options = ctx.inventoryState.filter((item) => item.slot === slot && !item.equipped);
    return `
      <div class="equip-modal-row">
        <div class="equip-modal-slot-label">${EQUIPMENT_SLOT_LABELS[slot]}</div>
        <div class="equip-modal-current">
          ${equipped ? `<span class="item-grade-${equipped.grade}">${escapeHtml(equipped.name)}</span>` : '비어있음'}
          ${equipped ? `<button type="button" class="equip-modal-unequip-btn" data-unequip-slot="${slot}">해제</button>` : ''}
        </div>
        <div class="equip-modal-options">
          ${
            options.length > 0
              ? `<select data-slot-select="${slot}">
                  ${options.map((item) => `<option value="${item.inventoryId}" class="item-grade-${item.grade}">${escapeHtml(item.name)}${item.quantity > 1 ? ` x${item.quantity}` : ''}</option>`).join('')}
                </select>
                <button type="button" class="equip-modal-equip-btn" data-equip-slot="${slot}">장착</button>`
              : '<span class="equip-modal-empty">착용 가능한 아이템 없음</span>'
          }
        </div>
      </div>
    `;
  }).join('');

  ctx.equipModalBody.querySelectorAll<HTMLSelectElement>('[data-slot-select]').forEach((select) => {
    const syncColor = () => {
      const selected = select.selectedOptions[0];
      select.style.color = selected ? getComputedStyle(selected).color : '';
    };
    syncColor();
    select.addEventListener('change', syncColor);
  });

  ctx.equipModalBody.querySelectorAll<HTMLButtonElement>('[data-equip-slot]').forEach((button) => {
    button.addEventListener('click', () => {
      const slot = button.dataset.equipSlot!;
      const select = ctx.equipModalBody.querySelector<HTMLSelectElement>(`[data-slot-select="${slot}"]`);
      const inventoryId = Number(select?.value);
      if (!inventoryId) return;
      const message: ClientMessage = { type: 'equipItem', inventoryId };
      ctx.socket.send(JSON.stringify(message));
    });
  });

  ctx.equipModalBody.querySelectorAll<HTMLButtonElement>('[data-unequip-slot]').forEach((button) => {
    button.addEventListener('click', () => {
      const slot = button.dataset.unequipSlot as EquipmentSlot;
      const message: ClientMessage = { type: 'unequipItem', slot };
      ctx.socket.send(JSON.stringify(message));
    });
  });
}

export function openEquipModal(ctx: GameContext): void {
  renderEquipModal(ctx);
  ctx.equipModal.hidden = false;
}

export function closeEquipModal(ctx: GameContext): void {
  ctx.equipModal.hidden = true;
}
