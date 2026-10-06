import type { Router } from 'express';
import { parseBody } from '../http/validation.js';
import { itemSchema } from '../content/itemsSchema.js';
import { db } from '../db/client.js';
import { toItemDto } from '../db/dto.js';
import type { ItemRow } from '../db/types.js';

export { itemSchema } from '../content/itemsSchema.js';

export function registerItemsRoutes(adminRouter: Router): void {
  adminRouter.get('/items', (_req, res) => {
    const rows = db.prepare('SELECT * FROM items ORDER BY id').all() as ItemRow[];
    res.json({ items: rows.map(toItemDto) });
  });

  adminRouter.post('/items', (req, res) => {
    const parsed = parseBody(itemSchema, req.body, res);
    if (!parsed) return;

    const d = parsed;
    const info = db
      .prepare(
        `INSERT INTO items (name, description, type, slot, level, grade, strength_bonus, dexterity_bonus, attack_power_bonus, intelligence_bonus, physical_defense_bonus, magic_defense_bonus, heal_amount, mana_amount, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.name,
        d.description,
        d.type,
        d.slot ?? null,
        d.level,
        d.grade,
        d.strengthBonus,
        d.dexterityBonus,
        d.attackPowerBonus,
        d.intelligenceBonus,
        d.physicalDefenseBonus,
        d.magicDefenseBonus,
        d.healAmount,
        d.manaAmount,
        d.value,
      );

    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(info.lastInsertRowid)) as ItemRow;
    res.status(201).json({ item: toItemDto(row) });
  });

  adminRouter.patch('/items/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM items WHERE id = ?').get(id)) {
      res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
      return;
    }

    const parsed = parseBody(itemSchema, req.body, res);
    if (!parsed) return;

    const d = parsed;
    db.prepare(
      `UPDATE items SET name = ?, description = ?, type = ?, slot = ?, level = ?, grade = ?,
         strength_bonus = ?, dexterity_bonus = ?, attack_power_bonus = ?, intelligence_bonus = ?, physical_defense_bonus = ?, magic_defense_bonus = ?,
         heal_amount = ?, mana_amount = ?, value = ?
       WHERE id = ?`,
    ).run(
      d.name,
      d.description,
      d.type,
      d.slot ?? null,
      d.level,
      d.grade,
      d.strengthBonus,
      d.dexterityBonus,
      d.attackPowerBonus,
      d.intelligenceBonus,
      d.physicalDefenseBonus,
      d.magicDefenseBonus,
      d.healAmount,
      d.manaAmount,
      d.value,
      id,
    );

    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow;
    res.json({ item: toItemDto(row) });
  });

  adminRouter.delete('/items/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM items WHERE id = ?').get(id)) {
      res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
      return;
    }

    const inUse = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM inventory_items WHERE item_id = ?) +
           (SELECT COUNT(*) FROM room_items WHERE item_id = ?) as count`,
      )
      .get(id, id) as { count: number };
    if (inUse.count > 0) {
      res.status(409).json({ error: '이미 캐릭터가 소지했거나 방에 놓여 있는 아이템은 삭제할 수 없습니다.' });
      return;
    }

    db.prepare('DELETE FROM mob_loot_pool WHERE item_id = ?').run(id);
    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    res.status(204).send();
  });
}
