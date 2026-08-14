import { formatItemMention, MAX_INVENTORY_SLOTS, type ItemGrade } from '@mud/shared';
import { db } from '../../db/client.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import { broadcastRoomSnapshot } from '../roomSnapshot.js';
import { broadcastToRoom, getSessionsInRoom } from '../sessionRegistry.js';
import { send } from '../wsUtil.js';
import type { CommandContext } from './context.js';
import { equipInventoryItem, sendEquipmentAndInventory } from './equipment.js';

interface InventoryRow {
  id: number;
  item_id: number;
  quantity: number;
  equipped: number;
  name: string;
  type: string;
  slot: string | null;
  level: number;
  grade: ItemGrade;
  heal_amount: number;
  mana_amount: number;
}

interface RoomItemRow {
  id: number;
  item_id: number;
  quantity: number;
  name: string;
  type: string;
  grade: ItemGrade;
}

function loadInventoryItemRows(characterId: number): InventoryRow[] {
  return db
    .prepare(
      `SELECT inv.id, inv.item_id, inv.quantity, inv.equipped, i.name, i.type, i.slot, i.level, i.grade, i.heal_amount, i.mana_amount
       FROM inventory_items inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.character_id = ?`,
    )
    .all(characterId) as InventoryRow[];
}

function findInventoryItem(characterId: number, nameQuery: string): InventoryRow | undefined {
  const lower = nameQuery.toLowerCase();
  return loadInventoryItemRows(characterId).find((row) => row.name.toLowerCase().includes(lower));
}

function findInventoryItemById(characterId: number, inventoryId: number): InventoryRow | undefined {
  return loadInventoryItemRows(characterId).find((row) => row.id === inventoryId);
}

function findRoomItem(roomId: number, nameQuery: string): RoomItemRow | undefined {
  const rows = db
    .prepare(
      `SELECT ri.id, ri.item_id, ri.quantity, i.name, i.type, i.grade
       FROM room_items ri
       JOIN items i ON i.id = ri.item_id
       WHERE ri.room_id = ?`,
    )
    .all(roomId) as RoomItemRow[];
  const lower = nameQuery.toLowerCase();
  return rows.find((row) => row.name.toLowerCase().includes(lower));
}

export function handleGet(ctx: CommandContext, itemName: string): void {
  const trimmed = itemName.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 줍겠습니까? 사용법: get <아이템>' });
    return;
  }

  const roomItem = findRoomItem(ctx.session.roomId, trimmed);
  if (!roomItem) {
    ctx.send({ type: 'text', text: '그런 아이템이 이곳에 없습니다.' });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM inventory_items WHERE character_id = ? AND item_id = ? AND equipped = 0')
    .get(ctx.session.characterId, roomItem.item_id) as { id: number } | undefined;

  // 물약 등 소모품은 인벤토리 칸을 차지하지 않는다.
  if (!existing && roomItem.type !== 'consumable') {
    const { count } = db
      .prepare(
        `SELECT COUNT(*) as count FROM inventory_items inv
         JOIN items i ON i.id = inv.item_id
         WHERE inv.character_id = ? AND i.type != 'consumable'`,
      )
      .get(ctx.session.characterId) as { count: number };
    if (count >= MAX_INVENTORY_SLOTS) {
      ctx.send({ type: 'text', text: `인벤토리가 가득 찼습니다. (${MAX_INVENTORY_SLOTS}/${MAX_INVENTORY_SLOTS})` });
      return;
    }
  }

  const moveTx = db.transaction(() => {
    if (roomItem.quantity > 1) {
      db.prepare('UPDATE room_items SET quantity = quantity - 1 WHERE id = ?').run(roomItem.id);
    } else {
      db.prepare('DELETE FROM room_items WHERE id = ?').run(roomItem.id);
    }

    if (existing) {
      db.prepare('UPDATE inventory_items SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
    } else {
      db.prepare(
        'INSERT INTO inventory_items (character_id, item_id, quantity, equipped) VALUES (?, ?, 1, 0)',
      ).run(ctx.session.characterId, roomItem.item_id);
    }
  });
  moveTx();

  const mention = formatItemMention(roomItem.name, roomItem.grade);
  ctx.send({ type: 'text', text: `${mention}을(를) 주웠습니다.` });
  broadcastToRoom(
    ctx.session.roomId,
    { type: 'text', text: `${ctx.session.characterName}님이 ${mention}을(를) 주웠습니다.` },
    ctx.session.ws,
  );
  broadcastRoomSnapshot(ctx.session.roomId);
  sendEquipmentAndInventory(ctx);
}

function performDrop(ctx: CommandContext, item: InventoryRow): void {
  const moveTx = db.transaction(() => {
    if (item.quantity > 1) {
      db.prepare('UPDATE inventory_items SET quantity = quantity - 1 WHERE id = ?').run(item.id);
    } else {
      db.prepare('DELETE FROM inventory_items WHERE id = ?').run(item.id);
    }

    const existing = db
      .prepare('SELECT id FROM room_items WHERE room_id = ? AND item_id = ?')
      .get(ctx.session.roomId, item.item_id) as { id: number } | undefined;

    if (existing) {
      db.prepare('UPDATE room_items SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO room_items (room_id, item_id, quantity) VALUES (?, ?, 1)').run(
        ctx.session.roomId,
        item.item_id,
      );
    }
  });
  moveTx();

  const mention = formatItemMention(item.name, item.grade);
  ctx.send({ type: 'text', text: `${mention}을(를) 버렸습니다.` });
  broadcastToRoom(
    ctx.session.roomId,
    { type: 'text', text: `${ctx.session.characterName}님이 ${mention}을(를) 버렸습니다.` },
    ctx.session.ws,
  );
  broadcastRoomSnapshot(ctx.session.roomId);
  sendEquipmentAndInventory(ctx);
}

export function handleDrop(ctx: CommandContext, itemName: string): void {
  const trimmed = itemName.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 버리시겠습니까? 사용법: drop <아이템>' });
    return;
  }

  const item = findInventoryItem(ctx.session.characterId, trimmed);
  if (!item) {
    ctx.send({ type: 'text', text: '그런 아이템을 가지고 있지 않습니다.' });
    return;
  }
  if (item.equipped) {
    ctx.send({ type: 'text', text: '장착 중인 아이템은 버릴 수 없습니다. 먼저 해제하세요.' });
    return;
  }

  performDrop(ctx, item);
}

export function handleDropItemMessage(ctx: CommandContext, inventoryId: number): void {
  const item = findInventoryItemById(ctx.session.characterId, inventoryId);
  if (!item) {
    ctx.send({ type: 'error', text: '그런 아이템을 가지고 있지 않습니다.' });
    return;
  }
  if (item.equipped) {
    ctx.send({ type: 'error', text: '장착 중인 아이템은 버릴 수 없습니다. 먼저 해제하세요.' });
    return;
  }

  performDrop(ctx, item);
}

/** 아이템 이름 다음 마지막 공백까지가 아이템명, 그 뒤 한 토큰이 대상 이름이다. 캐릭터 이름은 공백을 허용하지 않으므로 이 분리가 항상 안전하다. */
export function handleGive(ctx: CommandContext, rest: string): void {
  const trimmed = rest.trim();
  const spaceIndex = trimmed.lastIndexOf(' ');
  if (!trimmed || spaceIndex === -1) {
    ctx.send({ type: 'error', text: '사용법: give <아이템> <플레이어>' });
    return;
  }

  const itemName = trimmed.slice(0, spaceIndex).trim();
  const targetName = trimmed.slice(spaceIndex + 1).trim();
  if (!itemName || !targetName) {
    ctx.send({ type: 'error', text: '사용법: give <아이템> <플레이어>' });
    return;
  }
  if (targetName === ctx.session.characterName) {
    ctx.send({ type: 'error', text: '자기 자신에게는 줄 수 없습니다.' });
    return;
  }

  const item = findInventoryItem(ctx.session.characterId, itemName);
  if (!item) {
    ctx.send({ type: 'text', text: '그런 아이템을 가지고 있지 않습니다.' });
    return;
  }
  if (item.equipped) {
    ctx.send({ type: 'text', text: '장착 중인 아이템은 줄 수 없습니다. 먼저 해제하세요.' });
    return;
  }

  const targetSession = getSessionsInRoom(ctx.session.roomId).find((s) => s.characterName === targetName);
  if (!targetSession) {
    ctx.send({ type: 'text', text: `'${targetName}'님은 이 방에 없습니다.` });
    return;
  }

  const existingTarget = db
    .prepare('SELECT id FROM inventory_items WHERE character_id = ? AND item_id = ? AND equipped = 0')
    .get(targetSession.characterId, item.item_id) as { id: number } | undefined;

  if (!existingTarget && item.type !== 'consumable') {
    const { count } = db
      .prepare(
        `SELECT COUNT(*) as count FROM inventory_items inv
         JOIN items i ON i.id = inv.item_id
         WHERE inv.character_id = ? AND i.type != 'consumable'`,
      )
      .get(targetSession.characterId) as { count: number };
    if (count >= MAX_INVENTORY_SLOTS) {
      ctx.send({ type: 'text', text: `${targetName}님의 인벤토리가 가득 차 있습니다.` });
      return;
    }
  }

  const moveTx = db.transaction(() => {
    if (item.quantity > 1) {
      db.prepare('UPDATE inventory_items SET quantity = quantity - 1 WHERE id = ?').run(item.id);
    } else {
      db.prepare('DELETE FROM inventory_items WHERE id = ?').run(item.id);
    }

    if (existingTarget) {
      db.prepare('UPDATE inventory_items SET quantity = quantity + 1 WHERE id = ?').run(existingTarget.id);
    } else {
      db.prepare(
        'INSERT INTO inventory_items (character_id, item_id, quantity, equipped) VALUES (?, ?, 1, 0)',
      ).run(targetSession.characterId, item.item_id);
    }
  });
  moveTx();

  const mention = formatItemMention(item.name, item.grade);
  ctx.send({ type: 'text', text: `${targetName}님에게 ${mention}을(를) 주었습니다.` });
  send(targetSession.ws, { type: 'text', text: `${ctx.session.characterName}님이 ${mention}을(를) 주었습니다.` });

  sendEquipmentAndInventory(ctx);
  sendEquipmentAndInventory({ session: targetSession, send: (message) => send(targetSession.ws, message) });
}

export function handleInventory(ctx: CommandContext): void {
  const rows = db
    .prepare(
      `SELECT inv.quantity, inv.equipped, i.name, i.grade
       FROM inventory_items inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.character_id = ?`,
    )
    .all(ctx.session.characterId) as { quantity: number; equipped: number; name: string; grade: ItemGrade }[];

  if (rows.length === 0) {
    ctx.send({ type: 'text', text: '가진 아이템이 없습니다.' });
    return;
  }

  const lines = rows.map(
    (row) => `${formatItemMention(row.name, row.grade)} x${row.quantity}${row.equipped ? ' [장착중]' : ''}`,
  );
  ctx.send({ type: 'text', text: `소지품:\n${lines.join('\n')}` });
}

export function handleEquip(ctx: CommandContext, itemName: string): void {
  const trimmed = itemName.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 장착하시겠습니까? 사용법: equip <아이템>' });
    return;
  }

  const item = findInventoryItem(ctx.session.characterId, trimmed);
  if (!item) {
    ctx.send({ type: 'text', text: '그런 아이템을 가지고 있지 않습니다.' });
    return;
  }

  const result = equipInventoryItem(ctx.session.characterId, item.id);
  if (!result.ok) {
    ctx.send({ type: 'text', text: result.reason });
    return;
  }

  ctx.send({ type: 'text', text: `${result.itemName}을(를) 장착했습니다.` });
  sendEquipmentAndInventory(ctx);
  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });
}

export function handleUse(ctx: CommandContext, itemName: string): void {
  const trimmed = itemName.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 사용하시겠습니까? 사용법: use <아이템>' });
    return;
  }

  const item = findInventoryItem(ctx.session.characterId, trimmed);
  if (!item) {
    ctx.send({ type: 'text', text: '그런 아이템을 가지고 있지 않습니다.' });
    return;
  }
  if (item.heal_amount <= 0 && item.mana_amount <= 0) {
    ctx.send({ type: 'text', text: '사용할 수 없는 아이템입니다.' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const healed = Math.min(item.heal_amount, character.max_hp - character.hp);
  const restoredMp = Math.min(item.mana_amount, character.max_mp - character.mp);
  const newHp = character.hp + healed;
  const newMp = character.mp + restoredMp;

  const consumeTx = db.transaction(() => {
    db.prepare('UPDATE characters SET hp = ?, mp = ? WHERE id = ?').run(newHp, newMp, character.id);
    if (item.quantity > 1) {
      db.prepare('UPDATE inventory_items SET quantity = quantity - 1 WHERE id = ?').run(item.id);
    } else {
      db.prepare('DELETE FROM inventory_items WHERE id = ?').run(item.id);
    }
  });
  consumeTx();

  const effects: string[] = [];
  if (healed > 0) effects.push(`체력을 ${healed}만큼 회복했습니다. (${newHp}/${character.max_hp})`);
  if (restoredMp > 0) effects.push(`마나를 ${restoredMp}만큼 회복했습니다. (${newMp}/${character.max_mp})`);

  ctx.send({
    type: 'text',
    text: `${formatItemMention(item.name, item.grade)}을(를) 사용해 ${effects.length > 0 ? effects.join(' ') : '하지만 효과가 없었습니다.'}`,
  });

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });
  sendEquipmentAndInventory(ctx);
}
