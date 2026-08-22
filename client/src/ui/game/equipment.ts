import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  ITEM_GRADE_LABELS,
  type ClientMessage,
  type EquipmentSlot,
  type InventoryItemInfo,
} from '@mud/shared';
import { escapeHtml } from '../../domUtils';
import { icon } from '../icons';
import type { GameContext } from './context';
import { equipmentArt, PAPERDOLL_ART } from './equipmentAssets';

/**
 * 사람 실루엣 위에서 슬롯이 놓일 좌표(%) — 디아블로류 종이인형 배치.
 * 슬롯이 고정 크기 원형 소켓(6rem, 520px 폭 컨테이너 기준)이라, 실제 아이템 이름 길이와
 * 무관하게 항상 같은 크기다. 좌표는 어떤 두 슬롯도 중심간 거리가 소켓 지름보다 항상 크도록
 * 계산해서 잡았다 — 예전엔 슬롯 안에 아이템명을 직접 넣어서 카드 높이가 이름 길이에 따라
 * 늘어나 옆 슬롯과 겹쳤는데(#Round4 버그), 지금은 크기가 고정이라 좌표만 맞으면 절대 안 겹친다.
 * 소켓/아이콘을 키울 땐(#Round5 "아이콘 2배") 이 컨테이너 폭도 같은 비율로 키워야
 * 퍼센트 좌표 간 실제 픽셀 간격이 유지되어 겹침이 재발하지 않는다.
 */
const SLOT_POSITIONS: Record<EquipmentSlot, { top: number; left: number }> = {
  hat: { top: 5, left: 50 },
  earring: { top: 18, left: 88 },
  necklace: { top: 24, left: 50 },
  top: { top: 44, left: 50 },
  weapon: { top: 48, left: 12 },
  shield: { top: 48, left: 88 },
  bottom: { top: 65, left: 50 },
  gloves: { top: 70, left: 12 },
  ring: { top: 70, left: 88 },
  shoes: { top: 92, left: 50 },
};

export function renderEquipmentPanel(ctx: GameContext): void {
  const equippedCount = EQUIPMENT_SLOTS.filter((slot) => ctx.equipmentState[slot]).length;
  const slotsHtml = EQUIPMENT_SLOTS.map((slot) => {
    const equipped = ctx.equipmentState[slot];
    const slotState = equipped ? `equipment-slot-grade-${equipped.grade}` : 'is-empty';
    const itemName = equipped ? escapeHtml(equipped.name) : '비어있음';

    return `
      <div class="equipment-slot ${slotState}">
        <span class="equipment-slot-art" aria-hidden="true">${equipmentArt(slot, 'equipment-slot-art-image')}</span>
        <span class="equipment-slot-copy">
          <span class="equipment-slot-label">${EQUIPMENT_SLOT_LABELS[slot]}</span>
          <span class="equipment-slot-value">${equipped ? `<span class="item-grade-${equipped.grade}">${itemName}</span>` : itemName}</span>
        </span>
      </div>
    `;
  }).join('');

  ctx.equipmentPanel.innerHTML = `
    <div class="equipment-panel-heading">
      <span class="equipment-panel-title">현재 장비</span>
      <span class="equipment-panel-count">${equippedCount}/${EQUIPMENT_SLOTS.length}</span>
    </div>
    <div class="equipment-panel-grid">${slotsHtml}</div>
  `;
}

export function renderInventoryCount(ctx: GameContext): void {
  const slotsUsed = ctx.inventoryState.filter((item) => item.healAmount <= 0 && item.manaAmount <= 0).length;
  ctx.inventoryCountLabel.textContent = String(slotsUsed);
}

/** 체력만 채우면 heart, 마나만 채우면 droplet, 둘 다 채우는 엘릭서류는 sparkle로 구분한다. */
function potionIcon(item: { healAmount: number; manaAmount: number }): string {
  if (item.healAmount > 0 && item.manaAmount > 0) return icon('sparkle');
  if (item.manaAmount > 0) return icon('droplet');
  return icon('heart');
}

/**
 * 물약류(체력/마나 회복 아이템)는 인벤토리 칸을 차지하지 않으므로, 종류와 개수를 명령 입력창 아래
 * 한 줄로 모아 보여준다. 칩을 클릭하면 바로 사용된다(use 명령과 동일한 dedicated 메시지).
 */
export function renderPotionSummary(ctx: GameContext): void {
  const potions = ctx.inventoryState.filter((item) => item.healAmount > 0 || item.manaAmount > 0);
  if (potions.length === 0) {
    ctx.potionBar.innerHTML = '';
    return;
  }

  ctx.potionBar.innerHTML = potions
    .map(
      (item) => `
        <button type="button" class="potion-chip potion-chip-grade-${item.grade}" data-use-inventory-id="${item.inventoryId}" title="클릭하면 사용됩니다">
          <span class="potion-chip-icon potion-chip-icon-${item.healAmount > 0 && item.manaAmount > 0 ? 'elixir' : item.manaAmount > 0 ? 'mana' : 'health'} potion-chip-icon-grade-${item.grade}">${potionIcon(item)}</span>
          <span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span>
          <span class="potion-chip-qty">x${item.quantity}</span>
        </button>
      `,
    )
    .join('');

  ctx.potionBar.querySelectorAll<HTMLButtonElement>('[data-use-inventory-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const inventoryId = Number(button.dataset.useInventoryId);
      if (!inventoryId) return;
      const message: ClientMessage = { type: 'useItem', inventoryId };
      ctx.socket.send(JSON.stringify(message));
    });
  });
}

function sendEquip(ctx: GameContext, inventoryId: number): void {
  const message: ClientMessage = { type: 'equipItem', inventoryId };
  ctx.socket.send(JSON.stringify(message));
}

function sendUnequip(ctx: GameContext, slot: EquipmentSlot): void {
  ctx.lastEquipFlashSlot = slot;
  const message: ClientMessage = { type: 'unequipItem', slot };
  ctx.socket.send(JSON.stringify(message));
}

function sendSalvage(ctx: GameContext, inventoryId: number): void {
  const message: ClientMessage = { type: 'salvageItem', inventoryId };
  ctx.socket.send(JSON.stringify(message));
}

function sendDrop(ctx: GameContext, inventoryId: number): void {
  const message: ClientMessage = { type: 'dropItem', inventoryId };
  ctx.socket.send(JSON.stringify(message));
}

function sendReorder(ctx: GameContext, inventoryIds: number[]): void {
  const message: ClientMessage = { type: 'reorderInventory', inventoryIds };
  ctx.socket.send(JSON.stringify(message));
}

/** 카드가 너무 많을 때 등장 애니메이션 딜레이가 한없이 길어지지 않도록 인덱스를 여기서 자른다. */
const MAX_STAGGER_INDEX = 24;

/** 지금 드래그 중인 인벤토리 아이템 — dragover 시점엔 dataTransfer.getData를 못 읽는 브라우저가 있어서 모듈 스코프에 따로 들고 있는다. */
let draggedItem: InventoryItemInfo | null = null;

const STAT_BONUS_LABELS: Array<{ key: keyof InventoryItemInfo; label: string }> = [
  { key: 'attackPowerBonus', label: '공격력' },
  { key: 'strengthBonus', label: '힘' },
  { key: 'dexterityBonus', label: '민첩' },
  { key: 'intelligenceBonus', label: '지능' },
  { key: 'physicalDefenseBonus', label: '물리방어' },
  { key: 'magicDefenseBonus', label: '마법방어' },
];

/**
 * 디아블로류 아이템 툴팁 — 슬롯/카드는 아이콘만 보여주고, 이름·등급·스탯 수치는 전부 여기로 몬다.
 * 슬롯 안에 이름 텍스트를 직접 넣으면 긴 아이템명이 카드 높이를 늘려 종이인형 위 이웃 슬롯과
 * 겹치는 문제가 있었다 — 아이콘만 고정 크기로 두고 상세 정보는 hover 시에만 뜨는 툴팁으로 분리.
 */
function buildItemTooltipHtml(item: InventoryItemInfo, slotLabel: string): string {
  const statLines = STAT_BONUS_LABELS.filter(({ key }) => (item[key] as number) > 0)
    .map(({ key, label }) => `<div class="item-tooltip-stat">${label} +${item[key] as number}</div>`)
    .join('');
  const potionLines = [
    item.healAmount > 0 ? `<div class="item-tooltip-stat">HP 회복 +${item.healAmount}</div>` : '',
    item.manaAmount > 0 ? `<div class="item-tooltip-stat">MP 회복 +${item.manaAmount}</div>` : '',
  ].join('');

  return `
    <div class="item-tooltip-name item-grade-${item.grade}">${escapeHtml(item.name)}</div>
    <div class="item-tooltip-meta">${ITEM_GRADE_LABELS[item.grade]} · ${escapeHtml(slotLabel)} · Lv.${item.level}</div>
    ${statLines || potionLines ? `<div class="item-tooltip-stats">${statLines}${potionLines}</div>` : ''}
    <div class="item-tooltip-value">가치 ${item.value} gold</div>
  `;
}

function emptySlotTooltipHtml(slotLabel: string): string {
  return `<div class="item-tooltip-meta">${escapeHtml(slotLabel)} · 비어있음</div>`;
}

/** 인벤토리(가방) 한 줄 — 아이콘 · 이름 · 버리기(휴지통) · 분해 버튼을 한 행에 나란히 보여주는 목록형 UI. */
function renderItemRow(item: InventoryItemInfo, index: number): string {
  const delay = Math.min(index, MAX_STAGGER_INDEX) * 20;
  const slotIcon = item.slot ? equipmentArt(item.slot, 'item-row-art') : icon('gear');

  return `
    <div
      class="hud-card hud-card-enter item-row item-row-grade-${item.grade}"
      style="animation-delay: ${delay}ms"
      draggable="true"
      data-inventory-id="${item.inventoryId}"
      data-item-slot="${item.slot ?? ''}"
    >
      <span class="item-row-icon">${slotIcon}</span>
      <span class="item-row-name item-grade-${item.grade}" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
      ${item.quantity > 1 ? `<span class="item-row-qty">x${item.quantity}</span>` : ''}
      <button type="button" class="item-row-btn item-row-btn-drop" data-drop-inventory-id="${item.inventoryId}" title="버리기">${icon('trash')}</button>
      <button type="button" class="item-row-btn item-row-btn-salvage" data-salvage-inventory-id="${item.inventoryId}" title="분해 (${Math.floor(item.value * 0.05)} gold)">${icon('wrench')}</button>
    </div>
  `;
}

function findInventoryItem(ctx: GameContext, inventoryId: number): InventoryItemInfo | undefined {
  return ctx.inventoryState.find((item) => item.inventoryId === inventoryId);
}

/** 화면에 지금 보이는 가방 순서 그대로의 inventoryId 목록 — 재정렬 계산의 기준선. */
function currentBagOrder(ctx: GameContext): number[] {
  return ctx.inventoryState.filter((item) => !item.equipped).map((item) => item.inventoryId);
}

/** dragged 아이템을 targetInventoryId 바로 앞자리로 옮긴 새 순서를 계산해서 서버로 보낸다. targetInventoryId가 null이면 맨 뒤로 보낸다. */
function reorderBag(ctx: GameContext, draggedInventoryId: number, targetInventoryId: number | null): void {
  const order = currentBagOrder(ctx);
  const fromIndex = order.indexOf(draggedInventoryId);
  if (fromIndex === -1) return;
  order.splice(fromIndex, 1);
  if (targetInventoryId === null) {
    order.push(draggedInventoryId);
  } else {
    const toIndex = order.indexOf(targetInventoryId);
    if (toIndex === -1) return;
    order.splice(toIndex, 0, draggedInventoryId);
  }
  sendReorder(ctx, order);
}

const CHARACTER_STAT_STRIP: Array<{ key: 'attackPower' | 'physicalDefense' | 'magicDefense' | 'strength' | 'dexterity' | 'intelligence'; label: string }> = [
  { key: 'attackPower', label: '공격력' },
  { key: 'physicalDefense', label: '물리방어' },
  { key: 'magicDefense', label: '마법방어' },
  { key: 'strength', label: '힘' },
  { key: 'dexterity', label: '민첩' },
  { key: 'intelligence', label: '지능' },
];

/** 장비 탭의 스탯 요약 줄이 실제로 참조하는 CharacterState 필드 — state 메시지가 왔을 때
 * 이 값들이 안 바뀌었으면(예: 휴식 중 HP/MP만 도는 틱) 장비 탭을 다시 그릴 필요가 없다. */
export const EQUIP_STAT_STRIP_KEYS = CHARACTER_STAT_STRIP.map((entry) => entry.key);

/**
 * 장비/인벤토리 화면만 봐서는 "지금 뭘 입고 있고 그게 캐릭터에 어떤 효과를 주는지" 전혀 안 보인다는
 * 지적을 받아 추가한 패널 — 종이인형은 hover로만 상세를 보여주므로, hover 없이도 항상 보이는
 * 요약(이름 목록 + 합산 스탯)을 가방 위에 얹는다. 파이퍼돌의 소켓 좌표/크기는 절대 건드리지
 * 않는다(#Round4 겹침 버그가 이름 텍스트 때문에 생겼던 걸 좌표 재설계로 잡았기 때문).
 */
function buildEquipSummaryHtml(ctx: GameContext): string {
  const state = ctx.currentCharacterState;
  const statStripHtml = state
    ? CHARACTER_STAT_STRIP.map(({ key, label }) => `<span class="equip-stat-chip">${label} <b>${state[key]}</b></span>`).join('')
    : '';

  const rowsHtml = EQUIPMENT_SLOTS.map((slot) => {
    const equipped = ctx.equipmentState[slot];
    const nameHtml = equipped ? `<span class="item-grade-${equipped.grade}">${escapeHtml(equipped.name)}</span>` : '<span class="equip-summary-empty">비어있음</span>';
    return `<div class="equip-summary-row" title="${equipped ? escapeHtml(equipped.name) : ''}"><span class="equip-summary-label">${EQUIPMENT_SLOT_LABELS[slot]}</span>${nameHtml}</div>`;
  }).join('');

  return `
    <div class="equip-summary">
      ${statStripHtml ? `<div class="equip-stat-strip">${statStripHtml}</div>` : ''}
      <div class="equip-summary-grid">${rowsHtml}</div>
    </div>
  `;
}

/** 장비 탭(장비+인벤토리 통합 화면). 장착은 드래그 앤 드롭으로만 하고, 슬롯을 hover하면 낄 수 있는 아이템만 인벤토리에서 밝아진다. */
export function renderEquipTab(ctx: GameContext): void {
  const slotsHtml = EQUIPMENT_SLOTS.map((slot) => {
    const equipped = ctx.equipmentState[slot];
    const stateClasses = [
      equipped ? `equip-slot-grade-${equipped.grade}` : 'is-empty',
      ctx.lastEquipFlashSlot === slot ? 'is-flashing' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const position = SLOT_POSITIONS[slot];

    return `
      <div
        class="hud-card equip-slot ${stateClasses}"
        style="top: ${position.top}%; left: ${position.left}%"
        data-equip-slot="${slot}"
      >
        <span class="equip-slot-icon">${equipmentArt(slot, 'equip-slot-art')}</span>
        ${equipped ? `<button type="button" class="equip-slot-unequip" data-unequip-slot="${slot}" title="해제">✕</button>` : ''}
      </div>
    `;
  }).join('');

  ctx.lastEquipFlashSlot = null;

  const bagItems = ctx.inventoryState.filter((item) => !item.equipped);
  const bagHtml = bagItems.map((item, index) => renderItemRow(item, index)).join('');

  ctx.characterSheetBody.innerHTML = `
    <div class="equip-combined">
      <div class="equip-paperdoll">
        <img class="equip-paperdoll-art" src="${PAPERDOLL_ART}" alt="" aria-hidden="true" draggable="false" />
        ${slotsHtml}
      </div>
      <div class="equip-bag">
        <div class="equip-bag-header">
          <span>가방</span>
        </div>
        ${buildEquipSummaryHtml(ctx)}
        <div class="item-list">${bagHtml || '<p class="inventory-panel-empty">비어있습니다.</p>'}</div>
      </div>
    </div>
    <div class="item-tooltip" hidden></div>
  `;

  wireEquipTabInteractions(ctx);
}

/** 마우스를 따라다니되 모달/뷰포트 밖으로 나가지 않도록 살짝 안쪽으로 당겨준다. */
function positionTooltip(tooltip: HTMLDivElement, clientX: number, clientY: number): void {
  const margin = 16;
  const rect = tooltip.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width - margin;
  const maxTop = window.innerHeight - rect.height - margin;
  tooltip.style.left = `${Math.min(clientX + margin, Math.max(margin, maxLeft))}px`;
  tooltip.style.top = `${Math.min(clientY + margin, Math.max(margin, maxTop))}px`;
}

function wireEquipTabInteractions(ctx: GameContext): void {
  const root = ctx.characterSheetBody;
  const tooltip = root.querySelector<HTMLDivElement>('.item-tooltip')!;

  function showTooltip(html: string, event: MouseEvent): void {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    positionTooltip(tooltip, event.clientX, event.clientY);
  }
  function hideTooltip(): void {
    tooltip.hidden = true;
  }

  // 슬롯 해제 버튼
  root.querySelectorAll<HTMLButtonElement>('[data-unequip-slot]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      sendUnequip(ctx, button.dataset.unequipSlot as EquipmentSlot);
    });
  });

  // 슬롯 hover → 낄 수 있는 인벤토리 아이템만 밝아짐(장착 가능 미리보기) + 장착된 아이템의 스탯 툴팁
  root.querySelectorAll<HTMLDivElement>('[data-equip-slot]').forEach((slotEl) => {
    const slot = slotEl.dataset.equipSlot as EquipmentSlot;

    slotEl.addEventListener('mouseenter', () => {
      root.querySelectorAll<HTMLDivElement>(`[data-item-slot="${slot}"]`).forEach((card) => card.classList.add('is-eligible'));
    });
    slotEl.addEventListener('mouseleave', () => {
      root.querySelectorAll<HTMLDivElement>(`[data-item-slot="${slot}"]`).forEach((card) => card.classList.remove('is-eligible'));
      hideTooltip();
    });
    slotEl.addEventListener('mousemove', (event) => {
      const equipped = ctx.equipmentState[slot];
      const html = equipped ? buildItemTooltipHtml(equipped, EQUIPMENT_SLOT_LABELS[slot]) : emptySlotTooltipHtml(EQUIPMENT_SLOT_LABELS[slot]);
      showTooltip(html, event);
    });

    // 드래그 중인 아이템이 이 슬롯에 맞는지에 따라 드롭 허용 여부와 색을 다르게 표시
    slotEl.addEventListener('dragover', (event) => {
      if (!draggedItem || draggedItem.slot !== slot) return;
      event.preventDefault();
      slotEl.classList.add('is-drop-valid');
    });
    slotEl.addEventListener('dragleave', () => {
      slotEl.classList.remove('is-drop-valid');
    });
    slotEl.addEventListener('drop', (event) => {
      event.preventDefault();
      slotEl.classList.remove('is-drop-valid');
      if (!draggedItem || draggedItem.slot !== slot) return;
      ctx.lastEquipFlashSlot = slot;
      sendEquip(ctx, draggedItem.inventoryId);
      draggedItem = null;
    });
  });

  // 인벤토리 행: 드래그 시작점 + 행 위로 끌어오면 그 자리로 재정렬 + hover 시 스탯 툴팁 + 버리기/분해 버튼
  root.querySelectorAll<HTMLDivElement>('[data-inventory-id]').forEach((row) => {
    const inventoryId = Number(row.dataset.inventoryId);

    row.addEventListener('dragstart', (event) => {
      draggedItem = findInventoryItem(ctx, inventoryId) ?? null;
      event.dataTransfer?.setData('text/plain', String(inventoryId));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
      hideTooltip();
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      draggedItem = null;
    });

    // 다른 가방 행 위로 끌어오면(장비 슬롯이 아니라 행끼리) 순서를 바꾼다.
    row.addEventListener('dragover', (event) => {
      if (!draggedItem || draggedItem.inventoryId === inventoryId) return;
      event.preventDefault();
      row.classList.add('is-reorder-target');
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('is-reorder-target');
    });
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      row.classList.remove('is-reorder-target');
      if (!draggedItem || draggedItem.inventoryId === inventoryId) return;
      reorderBag(ctx, draggedItem.inventoryId, inventoryId);
      draggedItem = null;
    });

    row.addEventListener('mousemove', (event) => {
      const item = findInventoryItem(ctx, inventoryId);
      if (!item) return;
      const slotLabel = item.slot ? EQUIPMENT_SLOT_LABELS[item.slot] : '소모품';
      showTooltip(buildItemTooltipHtml(item, slotLabel), event);
    });
    row.addEventListener('mouseleave', hideTooltip);
  });

  // 버리기(휴지통, 골드 없이 그 자리에 버림) / 분해(판매가의 1/10 골드로 환급) — 행마다 바로 누를 수 있다.
  root.querySelectorAll<HTMLButtonElement>('[data-drop-inventory-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      sendDrop(ctx, Number(button.dataset.dropInventoryId));
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-salvage-inventory-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      sendSalvage(ctx, Number(button.dataset.salvageInventoryId));
    });
  });

  // 가방의 빈 공간(행이 아닌 곳)으로 끌어다 놓으면 맨 뒤로 보낸다.
  const bagList = root.querySelector<HTMLDivElement>('.item-list');
  if (bagList) {
    bagList.addEventListener('dragover', (event) => {
      if (!draggedItem) return;
      event.preventDefault();
    });
    bagList.addEventListener('drop', (event) => {
      event.preventDefault();
      if (!draggedItem) return;
      reorderBag(ctx, draggedItem.inventoryId, null);
      draggedItem = null;
    });
  }
}
