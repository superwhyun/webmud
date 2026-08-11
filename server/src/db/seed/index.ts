import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { EXITS, ROOMS, ROOM_ITEMS } from './rooms.js';
import { ITEMS } from './items/index.js';
import { MOB_LOOT_POOL, MOB_SPAWNS, MOB_TEMPLATES } from './mobs/index.js';
import { NPC_SPAWNS, NPC_TEMPLATES } from './npcs.js';

export const STARTING_ROOM_ID = 1;
export const FRONTIER_ROOM_ID = 10;
export { ITEMS } from './items/index.js';

const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME ?? 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin1234';
const SALT_ROUNDS = 10;

if (!process.env.DEFAULT_ADMIN_PASSWORD) {
  console.warn(
    `[db] DEFAULT_ADMIN_PASSWORD not set; seeding default admin account "${DEFAULT_ADMIN_USERNAME}" with a well-known password. Change it (or set DEFAULT_ADMIN_USERNAME/DEFAULT_ADMIN_PASSWORD) before exposing this server publicly.`,
  );
}

export function seed(db: Database.Database): void {
  const existing = db.prepare('SELECT id FROM rooms WHERE id = ?').get(STARTING_ROOM_ID);
  if (existing) return;

  const insertRoom = db.prepare('INSERT INTO rooms (id, name, description) VALUES (?, ?, ?)');
  const insertExit = db.prepare(
    'INSERT INTO room_exits (room_id, direction, target_room_id) VALUES (?, ?, ?)',
  );
  const insertItem = db.prepare(
    `INSERT INTO items (id, name, description, type, slot, level, grade, strength_bonus, dexterity_bonus, attack_power_bonus, intelligence_bonus, physical_defense_bonus, magic_defense_bonus, heal_amount, mana_amount, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertRoomItem = db.prepare(
    'INSERT INTO room_items (room_id, item_id, quantity) VALUES (?, ?, ?)',
  );
  const insertMobTemplate = db.prepare(
    `INSERT INTO mob_templates
       (id, name, hp, hp_max, strength, strength_max, dexterity, dexterity_max, physical_defense, physical_defense_max,
        magic_defense, magic_defense_max, element, damage_type, exp_reward, exp_reward_max, gold_reward, gold_reward_max,
        min_level, max_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMobSpawn = db.prepare(
    'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds) VALUES (?, ?, ?)',
  );
  const insertMobLootPoolEntry = db.prepare(
    'INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)',
  );
  const insertNpcTemplate = db.prepare(
    'INSERT INTO npc_templates (id, name, description, type, deal_type) VALUES (?, ?, ?, ?, ?)',
  );
  const insertNpcSpawn = db.prepare('INSERT INTO npc_spawns (room_id, npc_template_id) VALUES (?, ?)');
  const insertAdminAccount = db.prepare(
    'INSERT INTO accounts (username, password_hash, is_builder, is_admin) VALUES (?, ?, 1, 1)',
  );

  const seedTx = db.transaction(() => {
    insertAdminAccount.run(DEFAULT_ADMIN_USERNAME, bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, SALT_ROUNDS));
    for (const room of ROOMS) insertRoom.run(room.id, room.name, room.description);
    for (const exit of EXITS) insertExit.run(exit.roomId, exit.direction, exit.targetRoomId);
    for (const item of ITEMS) {
      insertItem.run(
        item.id,
        item.name,
        item.description,
        item.type,
        item.slot,
        item.level,
        item.grade,
        item.strengthBonus,
        item.dexterityBonus,
        item.attackPowerBonus,
        item.intelligenceBonus,
        item.physicalDefenseBonus,
        item.magicDefenseBonus,
        item.healAmount,
        item.manaAmount,
        item.value,
      );
    }
    for (const roomItem of ROOM_ITEMS) {
      insertRoomItem.run(roomItem.roomId, roomItem.itemId, roomItem.quantity);
    }
    for (const template of MOB_TEMPLATES) {
      insertMobTemplate.run(
        template.id,
        template.name,
        template.hp,
        template.hpMax,
        template.strength,
        template.strengthMax,
        template.dexterity,
        template.dexterityMax,
        template.physicalDefense,
        template.physicalDefenseMax,
        template.magicDefense,
        template.magicDefenseMax,
        template.element,
        template.damageType,
        template.expReward,
        template.expRewardMax,
        template.goldReward,
        template.goldRewardMax,
        template.minLevel,
        template.maxLevel,
      );
    }
    for (const spawn of MOB_SPAWNS) {
      insertMobSpawn.run(spawn.roomId, spawn.mobTemplateId, spawn.respawnSeconds);
    }
    for (const entry of MOB_LOOT_POOL) {
      insertMobLootPoolEntry.run(entry.mobTemplateId, entry.itemId, entry.weight);
    }
    for (const template of NPC_TEMPLATES) {
      insertNpcTemplate.run(template.id, template.name, template.description, template.type, template.dealType);
    }
    for (const spawn of NPC_SPAWNS) {
      insertNpcSpawn.run(spawn.roomId, spawn.npcTemplateId);
    }
  });
  seedTx();
}
