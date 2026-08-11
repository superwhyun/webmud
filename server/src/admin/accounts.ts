import { z } from 'zod';
import { db } from '../db/client.js';
import { grantGold, placeAccountCharacter } from './moderation.js';
import { adminRouter } from './router.js';

interface AccountRow {
  id: number;
  username: string;
  is_builder: number;
  is_admin: number;
  gold: number | null;
  room_id: number | null;
  room_name: string | null;
}

const accountsQuery = `SELECT a.id, a.username, a.is_builder, a.is_admin, c.gold as gold, c.room_id as room_id, r.name as room_name
       FROM accounts a
       LEFT JOIN characters c ON c.account_id = a.id
       LEFT JOIN rooms r ON r.id = c.room_id`;

function toAccountDto(row: AccountRow) {
  return {
    id: row.id,
    username: row.username,
    isBuilder: Boolean(row.is_builder),
    isAdmin: Boolean(row.is_admin),
    gold: row.gold,
    roomId: row.room_id,
    roomName: row.room_name,
  };
}

adminRouter.get('/accounts', (_req, res) => {
  const rows = db.prepare(`${accountsQuery} ORDER BY a.username`).all() as AccountRow[];
  res.json({ accounts: rows.map(toAccountDto) });
});

const accountPatchSchema = z.object({
  isBuilder: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
});

adminRouter.patch('/accounts/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM accounts WHERE id = ?').get(id)) {
    res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
    return;
  }

  const parsed = accountPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { isBuilder, isAdmin } = parsed.data;
  if (isBuilder === undefined && isAdmin === undefined) {
    res.status(400).json({ error: '수정할 내용이 없습니다.' });
    return;
  }

  const fields: string[] = [];
  const values: number[] = [];
  if (isBuilder !== undefined) {
    fields.push('is_builder = ?');
    values.push(isBuilder ? 1 : 0);
  }
  if (isAdmin !== undefined) {
    fields.push('is_admin = ?');
    values.push(isAdmin ? 1 : 0);
  }
  values.push(id);

  db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare(`${accountsQuery} WHERE a.id = ?`).get(id) as AccountRow;
  res.json({ account: toAccountDto(row) });
});

const grantGoldSchema = z.object({
  amount: z.number().int().positive('지급할 골드는 1 이상이어야 합니다.'),
});

adminRouter.post('/accounts/:id/grant-gold', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM accounts WHERE id = ?').get(id)) {
    res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
    return;
  }

  const parsed = grantGoldSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const result = grantGold(id, parsed.data.amount);
  if (!result.ok) {
    res.status(409).json({ error: result.error });
    return;
  }

  res.json({ gold: result.gold });
});

const placeSchema = z.object({
  targetRoomId: z.number().int(),
});

adminRouter.post('/accounts/:id/place', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM accounts WHERE id = ?').get(id)) {
    res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
    return;
  }

  const parsed = placeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const result = placeAccountCharacter(id, parsed.data.targetRoomId);
  if (!result.ok) {
    res.status(409).json({ error: result.error });
    return;
  }

  res.json({ roomId: result.roomId, roomName: result.roomName });
});
