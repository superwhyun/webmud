import { z } from 'zod';
import { db } from '../db/client.js';
import { toItemDto } from '../db/dto.js';
import type { ItemRow } from '../db/types.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { getRoom } from '../game/World.js';
import { builderRouter } from './router.js';

builderRouter.get('/item-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM items ORDER BY id').all() as ItemRow[];
  res.json({ items: rows.map(toItemDto) });
});

builderRouter.get('/room-items', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ri.id, ri.room_id, ri.item_id, ri.quantity, r.name as room_name, i.name as item_name, i.grade as item_grade
       FROM room_items ri JOIN rooms r ON r.id = ri.room_id JOIN items i ON i.id = ri.item_id
       ORDER BY ri.id`,
    )
    .all() as {
    id: number;
    room_id: number;
    item_id: number;
    quantity: number;
    room_name: string;
    item_name: string;
    item_grade: string;
  }[];

  res.json({
    roomItems: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      itemId: row.item_id,
      itemName: row.item_name,
      itemGrade: row.item_grade,
      quantity: row.quantity,
    })),
  });
});

const roomItemSchema = z.object({
  roomId: z.number().int(),
  itemId: z.number().int(),
  quantity: z.number().int().min(1).default(1),
});

export type CreateRoomItemInput = z.infer<typeof roomItemSchema>;
export type CreateRoomItemOutcome = { ok: true } | { error: string; status: number };

/** Validates and inserts a room item drop. Shared by the HTTP route and the map assistant's apply step. */
export function createRoomItemRecord(input: CreateRoomItemInput): CreateRoomItemOutcome {
  const { roomId, itemId, quantity } = input;
  if (!getRoom(roomId)) {
    return { error: '방을 찾을 수 없습니다.', status: 404 };
  }
  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(itemId)) {
    return { error: '아이템을 찾을 수 없습니다.', status: 404 };
  }

  db.prepare('INSERT INTO room_items (room_id, item_id, quantity) VALUES (?, ?, ?)').run(roomId, itemId, quantity);
  broadcastRoomSnapshot(roomId);
  return { ok: true };
}

builderRouter.post('/room-items', (req, res) => {
  const parsed = roomItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const outcome = createRoomItemRecord(parsed.data);
  if ('error' in outcome) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }

  res.status(201).send();
});

const roomItemDeleteSchema = z.object({ roomItemId: z.number().int() });

builderRouter.delete('/room-items', (req, res) => {
  const parsed = roomItemDeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const row = db.prepare('SELECT room_id FROM room_items WHERE id = ?').get(parsed.data.roomItemId) as
    | { room_id: number }
    | undefined;
  db.prepare('DELETE FROM room_items WHERE id = ?').run(parsed.data.roomItemId);
  if (row) broadcastRoomSnapshot(row.room_id);
  res.status(204).send();
});
