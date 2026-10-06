import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { initializeDatabase } from './migrations/index.js';
import { migrateSchema } from './migrations/schema.js';

describe('isolated database initialization', () => {
  it('creates all content in memory and preserves admin edits and custom content when repeated', () => {
    const db = openDatabase(':memory:');
    try {
      db.prepare("UPDATE items SET name = '관리자 수정' WHERE id = 1").run();
      db.prepare("INSERT INTO zones (name, description, min_level, max_level) VALUES ('사용자 존', '', 3, 7)").run();
      const before = db.prepare('SELECT COUNT(*) AS count FROM rooms').get();
      initializeDatabase(db);
      expect(db.prepare('SELECT COUNT(*) AS count FROM rooms').get()).toEqual(before);
      expect(db.prepare('SELECT name FROM items WHERE id = 1').get()).toEqual({ name: '관리자 수정' });
      expect(db.prepare("SELECT min_level, max_level FROM zones WHERE name = '사용자 존'").get()).toEqual({ min_level: 3, max_level: 7 });
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      db.close();
    }
  });

  it('backfills legacy columns without losing values', () => {
    const db = openDatabase(':memory:');
    try {
      const original = db.prepare('SELECT hp FROM mob_templates WHERE id = 1').get() as { hp: number };
      db.exec('ALTER TABLE mob_templates DROP COLUMN hp_max');
      db.exec('ALTER TABLE inventory_items DROP COLUMN sort_order');
      db.exec('ALTER TABLE npc_templates ADD COLUMN level INTEGER');
      migrateSchema(db);
      expect(db.prepare('SELECT hp, hp_max FROM mob_templates WHERE id = 1').get()).toMatchObject({ hp: original.hp, hp_max: original.hp });
      expect((db.prepare('PRAGMA table_info(npc_templates)').all() as { name: string }[]).map((row) => row.name)).not.toContain('level');
      expect((db.prepare('PRAGMA table_info(inventory_items)').all() as { name: string }[]).map((row) => row.name)).toContain('sort_order');
    } finally {
      db.close();
    }
  });
});
