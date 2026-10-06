import type { Router } from 'express';
import { parseBody } from '../http/validation.js';
import { z } from 'zod';
import { db } from '../db/client.js';
import { grantGold, placeAccountCharacter } from './moderation.js';

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

const accountPatchSchema = z.object({
  isBuilder: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
});

const grantGoldSchema = z.object({
  amount: z.number().int().positive('지급할 골드는 1 이상이어야 합니다.'),
});

const placeSchema = z.object({
  targetRoomId: z.number().int(),
});

export function registerAccountsRoutes(adminRouter: Router): void {
  adminRouter.get('/accounts', (_req, res) => {
    const rows = db.prepare(`${accountsQuery} ORDER BY a.username`).all() as AccountRow[];
    res.json({ accounts: rows.map(toAccountDto) });
  });

  adminRouter.patch('/accounts/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM accounts WHERE id = ?').get(id)) {
      res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
      return;
    }

    const parsed = parseBody(accountPatchSchema, req.body, res);
    if (!parsed) return;

    const { isBuilder, isAdmin } = parsed;
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

  adminRouter.post('/accounts/:id/grant-gold', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM accounts WHERE id = ?').get(id)) {
      res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
      return;
    }

    const parsed = parseBody(grantGoldSchema, req.body, res);
    if (!parsed) return;

    const result = grantGold(id, parsed.amount);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }

    res.json({ gold: result.gold });
  });

  adminRouter.post('/accounts/:id/place', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM accounts WHERE id = ?').get(id)) {
      res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
      return;
    }

    const parsed = parseBody(placeSchema, req.body, res);
    if (!parsed) return;

    const result = placeAccountCharacter(id, parsed.targetRoomId);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }

    res.json({ roomId: result.roomId, roomName: result.roomName });
  });
}
