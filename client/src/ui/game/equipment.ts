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
  ctx.inventoryCountLabel.textContent = String(ctx.inventoryState.length);
}

export function renderInventoryModal(ctx: GameContext): void {
  ctx.inventoryModalBody.innerHTML =
    ctx.inventoryState
      .map(
        (item) => `
          <div class="inventory-panel-row">
            <span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span>
            <span class="inventory-panel-qty">${item.quantity > 1 ? `x${item.quantity}` : ''}${item.equipped ? ' [장착]' : ''}</span>
          </div>
        `,
      )
      .join('') || '<div class="inventory-panel-empty">비어있음</div>';
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
                  ${options.map((item) => `<option value="${item.inventoryId}">${escapeHtml(item.name)}${item.quantity > 1 ? ` x${item.quantity}` : ''}</option>`).join('')}
                </select>
                <button type="button" class="equip-modal-equip-btn" data-equip-slot="${slot}">장착</button>`
              : '<span class="equip-modal-empty">착용 가능한 아이템 없음</span>'
          }
        </div>
      </div>
    `;
  }).join('');

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
