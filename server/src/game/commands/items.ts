import { formatItemMention, type ItemGrade } from '@mud/shared';
import { db } from '../../db/client.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import { broadcastRoomSnapshot } from '../roomSnapshot.js';
import { broadcastToRoom } from '../sessionRegistry.js';
import type { CommandContext } from './context.js';

interface InventoryRow {
  id: number;
  item_id: number;
  quantity: number;
  equipped: number;
  name: string;
  type: string;
  level: number;
  grade: ItemGrade;
  heal_amount: number;
}

interface RoomItemRow {
  id: number;
  item_id: number;
  quantity: number;
  name: string;
  grade: ItemGrade;
}

function findInventoryItem(characterId: number, nameQuery: string): InventoryRow | undefined {
  const rows = db
    .prepare(
      `SELECT inv.id, inv.item_id, inv.quantity, inv.equipped, i.name, i.type, i.level, i.grade, i.heal_amount
       FROM inventory_items inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.character_id = ?`,
    )
    .all(characterId) as InventoryRow[];
  const lower = nameQuery.toLowerCase();
  return rows.find((row) => row.name.toLowerCase().includes(lower));
}

function findRoomItem(roomId: number, nameQuery: string): RoomItemRow | undefined {
  const rows = db
    .prepare(
      `SELECT ri.id, ri.item_id, ri.quantity, i.name, i.grade
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

  const moveTx = db.transaction(() => {
    if (roomItem.quantity > 1) {
      db.prepare('UPDATE room_items SET quantity = quantity - 1 WHERE id = ?').run(roomItem.id);
    } else {
      db.prepare('DELETE FROM room_items WHERE id = ?').run(roomItem.id);
    }

    const existing = db
      .prepare(
        'SELECT id FROM inventory_items WHERE character_id = ? AND item_id = ? AND equipped = 0',
      )
      .get(ctx.session.characterId, roomItem.item_id) as { id: number } | undefined;

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
  if (item.type !== 'weapon' && item.type !== 'armor') {
    ctx.send({ type: 'text', text: '장착할 수 없는 아이템입니다.' });
    return;
  }
  if (item.equipped) {
    ctx.send({ type: 'text', text: '이미 장착 중입니다.' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  if (character.level < item.level) {
    ctx.send({
      type: 'text',
      text: `레벨이 부족합니다. ${formatItemMention(item.name, item.grade)}은(는) 레벨 ${item.level}부터 장착할 수 있습니다.`,
    });
    return;
  }

  const equipTx = db.transaction(() => {
    db.prepare(
      `UPDATE inventory_items SET equipped = 0
       WHERE character_id = ? AND equipped = 1 AND item_id IN (SELECT id FROM items WHERE type = ?)`,
    ).run(ctx.session.characterId, item.type);
    db.prepare('UPDATE inventory_items SET equipped = 1 WHERE id = ?').run(item.id);
  });
  equipTx();

  ctx.send({ type: 'text', text: `${formatItemMention(item.name, item.grade)}을(를) 장착했습니다.` });
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
  if (item.heal_amount <= 0) {
    ctx.send({ type: 'text', text: '사용할 수 없는 아이템입니다.' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const healed = Math.min(item.heal_amount, character.max_hp - character.hp);
  const newHp = character.hp + healed;

  const consumeTx = db.transaction(() => {
    db.prepare('UPDATE characters SET hp = ? WHERE id = ?').run(newHp, character.id);
    if (item.quantity > 1) {
      db.prepare('UPDATE inventory_items SET quantity = quantity - 1 WHERE id = ?').run(item.id);
    } else {
      db.prepare('DELETE FROM inventory_items WHERE id = ?').run(item.id);
    }
  });
  consumeTx();

  ctx.send({
    type: 'text',
    text: `${formatItemMention(item.name, item.grade)}을(를) 사용해 체력을 ${healed}만큼 회복했습니다. (${newHp}/${character.max_hp})`,
  });

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });
}
