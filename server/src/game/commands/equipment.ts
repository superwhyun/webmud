import {
  EQUIPMENT_SLOTS,
  formatItemMention,
  type EquipmentSlot,
  type EquipmentSnapshot,
  type InventoryItemInfo,
  type ItemGrade,
} from '@mud/shared';
import { db } from '../../db/client.js';
import { loadCharacterState } from '../characterState.js';
import type { CommandContext } from './context.js';

interface InventoryQueryRow {
  id: number;
  name: string;
  quantity: number;
  equipped: number;
  slot: string | null;
  grade: ItemGrade;
  level: number;
  heal_amount: number;
  mana_amount: number;
  strength_bonus: number;
  dexterity_bonus: number;
  intelligence_bonus: number;
  physical_defense_bonus: number;
  magic_defense_bonus: number;
  attack_power_bonus: number;
  value: number;
}

function loadInventoryRows(characterId: number): InventoryQueryRow[] {
  return db
    .prepare(
      `SELECT inv.id, i.name, inv.quantity, inv.equipped, i.slot, i.grade, i.level,
              i.heal_amount, i.mana_amount, i.strength_bonus, i.dexterity_bonus, i.intelligence_bonus,
              i.physical_defense_bonus, i.magic_defense_bonus, i.attack_power_bonus, i.value
       FROM inventory_items inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.character_id = ?
       ORDER BY inv.sort_order ASC, inv.id ASC`,
    )
    .all(characterId) as InventoryQueryRow[];
}

function toInventoryItemInfo(row: InventoryQueryRow): InventoryItemInfo {
  return {
    inventoryId: row.id,
    name: row.name,
    quantity: row.quantity,
    equipped: Boolean(row.equipped),
    slot: (row.slot as EquipmentSlot | null) ?? null,
    grade: row.grade,
    level: row.level,
    healAmount: row.heal_amount,
    manaAmount: row.mana_amount,
    strengthBonus: row.strength_bonus,
    dexterityBonus: row.dexterity_bonus,
    intelligenceBonus: row.intelligence_bonus,
    physicalDefenseBonus: row.physical_defense_bonus,
    magicDefenseBonus: row.magic_defense_bonus,
    attackPowerBonus: row.attack_power_bonus,
    value: row.value,
  };
}

export function getInventorySnapshot(characterId: number): InventoryItemInfo[] {
  return loadInventoryRows(characterId).map(toInventoryItemInfo);
}

export function getEquipmentSnapshot(characterId: number): EquipmentSnapshot {
  const slots: EquipmentSnapshot = {};
  for (const row of loadInventoryRows(characterId)) {
    if (!row.equipped || !row.slot) continue;
    if (!EQUIPMENT_SLOTS.includes(row.slot as EquipmentSlot)) continue;
    slots[row.slot as EquipmentSlot] = toInventoryItemInfo(row);
  }
  return slots;
}

export function sendEquipmentAndInventory(ctx: CommandContext): void {
  ctx.send({ type: 'equipment', slots: getEquipmentSnapshot(ctx.session.characterId) });
  ctx.send({ type: 'inventory', items: getInventorySnapshot(ctx.session.characterId) });
}

type EquipResult = { ok: true; itemName: string } | { ok: false; reason: string };

export function equipInventoryItem(characterId: number, inventoryId: number): EquipResult {
  const row = db
    .prepare(
      `SELECT inv.id, inv.equipped, i.name, i.slot, i.level, i.grade
       FROM inventory_items inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(inventoryId, characterId) as
    | { id: number; equipped: number; name: string; slot: string | null; level: number; grade: ItemGrade }
    | undefined;

  if (!row) return { ok: false, reason: '그런 아이템을 가지고 있지 않습니다.' };
  if (!row.slot) return { ok: false, reason: '장착할 수 없는 아이템입니다.' };
  if (row.equipped) return { ok: false, reason: '이미 장착 중입니다.' };

  const character = db.prepare('SELECT level FROM characters WHERE id = ?').get(characterId) as
    | { level: number }
    | undefined;
  if (character && character.level < row.level) {
    return {
      ok: false,
      reason: `레벨이 부족합니다. ${formatItemMention(row.name, row.grade)}은(는) 레벨 ${row.level}부터 장착할 수 있습니다.`,
    };
  }

  const equipTx = db.transaction(() => {
    db.prepare(
      `UPDATE inventory_items SET equipped = 0
       WHERE character_id = ? AND equipped = 1
       AND item_id IN (SELECT id FROM items WHERE slot = ?)`,
    ).run(characterId, row.slot);
    db.prepare('UPDATE inventory_items SET equipped = 1 WHERE id = ?').run(row.id);
  });
  equipTx();

  return { ok: true, itemName: formatItemMention(row.name, row.grade) };
}

export function unequipSlot(characterId: number, slot: EquipmentSlot): EquipResult {
  const row = db
    .prepare(
      `SELECT inv.id, i.name, i.grade
       FROM inventory_items inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.character_id = ? AND inv.equipped = 1 AND i.slot = ?`,
    )
    .get(characterId, slot) as { id: number; name: string; grade: ItemGrade } | undefined;

  if (!row) return { ok: false, reason: '해당 부위에 장착된 아이템이 없습니다.' };

  db.prepare('UPDATE inventory_items SET equipped = 0 WHERE id = ?').run(row.id);
  return { ok: true, itemName: formatItemMention(row.name, row.grade) };
}

export function handleEquipItemMessage(ctx: CommandContext, inventoryId: number): void {
  const result = equipInventoryItem(ctx.session.characterId, inventoryId);
  if (!result.ok) {
    ctx.send({ type: 'error', text: result.reason });
    return;
  }
  ctx.send({ type: 'text', text: `${result.itemName}을(를) 장착했습니다.` });
  sendEquipmentAndInventory(ctx);
  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });
}

export function handleUnequipItemMessage(ctx: CommandContext, slot: EquipmentSlot): void {
  const result = unequipSlot(ctx.session.characterId, slot);
  if (!result.ok) {
    ctx.send({ type: 'error', text: result.reason });
    return;
  }
  ctx.send({ type: 'text', text: `${result.itemName}을(를) 해제했습니다.` });
  sendEquipmentAndInventory(ctx);
  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });
}

/**
 * 가방 안에서 드래그로 옮긴 새 순서를 통째로 받아 sort_order에 그대로 반영한다. 클라이언트가
 * 보낸 id 중 이 캐릭터 소유가 아니거나 이미 장착된 아이템은 조용히 무시한다(다른 탭에서 먼저
 * 장착했다거나 하는 경쟁 상황에도 서버 쪽 진실을 깨지 않기 위함).
 */
export function handleReorderInventoryMessage(ctx: CommandContext, inventoryIds: number[]): void {
  const ownedRows = db
    .prepare('SELECT id FROM inventory_items WHERE character_id = ? AND equipped = 0')
    .all(ctx.session.characterId) as { id: number }[];
  const ownedIds = new Set(ownedRows.map((row) => row.id));

  const update = db.prepare('UPDATE inventory_items SET sort_order = ? WHERE id = ? AND character_id = ?');
  const reorderTx = db.transaction(() => {
    inventoryIds.forEach((inventoryId, index) => {
      if (!ownedIds.has(inventoryId)) return;
      update.run(index, inventoryId, ctx.session.characterId);
    });
  });
  reorderTx();

  sendEquipmentAndInventory(ctx);
}
