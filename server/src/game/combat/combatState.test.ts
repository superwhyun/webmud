import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { db } from '../../db/client.js';
import type { MobTemplateRow } from '../../db/types.js';
import type { CommandContext } from '../commands/context.js';
import { despawnMob, registerMobSpawn } from '../MobManager.js';
import { addExit, registerRoom, unregisterRoom } from '../World.js';
import { cleanupCombatForSession, handleFlee, isInCombat } from './CombatManager.js';
import { startCombatInterval } from './combatState.js';
import { handleMobDefeat } from './combatRewards.js';

// 시드 데이터: 몹 템플릿 1(쥐).
const TEST_MOB_TEMPLATE_ID = 1;

const createdZoneIds: number[] = [];
const createdRoomIds: number[] = [];
const createdAccountIds: number[] = [];
const createdCharacterIds: number[] = [];
const createdSpawnIds: number[] = [];
const createdSockets: WebSocket[] = [];

function insertZoneWithRooms(withExit: boolean): { roomAId: number; roomBId: number } {
  const zoneId = Number(
    db
      .prepare('INSERT INTO zones (name, min_level, max_level) VALUES (?, 1, 5)')
      .run(`도망 테스트 존 ${Date.now()}-${Math.random()}`).lastInsertRowid,
  );
  createdZoneIds.push(zoneId);
  const roomAId = Number(
    db.prepare('INSERT INTO rooms (name, description, zone_id) VALUES (?, ?, ?)').run('도망 테스트 방A', '', zoneId)
      .lastInsertRowid,
  );
  const roomBId = Number(
    db.prepare('INSERT INTO rooms (name, description, zone_id) VALUES (?, ?, ?)').run('도망 테스트 방B', '', zoneId)
      .lastInsertRowid,
  );
  createdRoomIds.push(roomAId, roomBId);
  registerRoom({ id: roomAId, name: '도망 테스트 방A', description: '', x: 0, y: 0, zoneId, exits: {} });
  registerRoom({ id: roomBId, name: '도망 테스트 방B', description: '', x: 1, y: 0, zoneId, exits: {} });
  if (withExit) addExit(roomAId, 'east', roomBId);
  return { roomAId, roomBId };
}

function insertCharacter(roomId: number): { accountId: number; characterId: number } {
  const suffix = `${Date.now()}-${Math.random()}`;
  const accountId = Number(
    db.prepare('INSERT INTO accounts (username, password_hash) VALUES (?, ?)').run(`도망계정-${suffix}`, 'hash')
      .lastInsertRowid,
  );
  createdAccountIds.push(accountId);
  const characterId = Number(
    db
      .prepare(
        `INSERT INTO characters (account_id, name, room_id, hp, max_hp, strength, dexterity, physical_defense, magic_defense, element)
         VALUES (?, ?, ?, 100, 100, 10, 10, 5, 5, 'wood')`,
      )
      .run(accountId, `도망캐릭-${suffix}`, roomId).lastInsertRowid,
  );
  createdCharacterIds.push(characterId);
  return { accountId, characterId };
}

function makeContext(roomId: number, characterId: number, accountId: number): CommandContext {
  const ws = {} as WebSocket;
  createdSockets.push(ws);
  return {
    session: { ws, accountId, characterId, characterName: `flee-tester-${characterId}`, roomId },
    send: vi.fn(),
  };
}

afterEach(() => {
  for (const ws of createdSockets.splice(0)) cleanupCombatForSession(ws);
  vi.restoreAllMocks();
  for (const spawnId of createdSpawnIds.splice(0)) despawnMob(spawnId);
  for (const characterId of createdCharacterIds.splice(0)) db.prepare('DELETE FROM characters WHERE id = ?').run(characterId);
  for (const accountId of createdAccountIds.splice(0)) db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  for (const roomId of createdRoomIds.splice(0)) {
    unregisterRoom(roomId);
    db.prepare('DELETE FROM room_items WHERE room_id = ?').run(roomId);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
  }
  for (const zoneId of createdZoneIds.splice(0)) db.prepare('DELETE FROM zones WHERE id = ?').run(zoneId);
});

describe('handleFlee', () => {
  it('moves the fleeing character through an open exit instead of leaving them in the same room', () => {
    const { roomAId, roomBId } = insertZoneWithRooms(true);
    const { accountId, characterId } = insertCharacter(roomAId);

    const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(TEST_MOB_TEMPLATE_ID) as MobTemplateRow;
    const spawnId = -777001;
    const mob = registerMobSpawn(spawnId, roomAId, template, 60);
    mob.hp = 100_000;
    mob.maxHp = 100_000;
    createdSpawnIds.push(spawnId);

    const ctx = makeContext(roomAId, characterId, accountId);
    startCombatInterval(ctx, [mob]);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    handleFlee(ctx);

    expect(ctx.session.roomId).toBe(roomBId);
    const row = db.prepare('SELECT room_id FROM characters WHERE id = ?').get(characterId) as { room_id: number };
    expect(row.room_id).toBe(roomBId);
    expect(isInCombat(ctx.session.ws)).toBe(false);
  });

  it('keeps the character in place when there is no open exit to flee through', () => {
    const { roomAId } = insertZoneWithRooms(false);
    const { accountId, characterId } = insertCharacter(roomAId);

    const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(TEST_MOB_TEMPLATE_ID) as MobTemplateRow;
    const spawnId = -777002;
    const mob = registerMobSpawn(spawnId, roomAId, template, 60);
    mob.hp = 100_000;
    mob.maxHp = 100_000;
    createdSpawnIds.push(spawnId);

    const ctx = makeContext(roomAId, characterId, accountId);
    startCombatInterval(ctx, [mob]);

    handleFlee(ctx);

    expect(ctx.session.roomId).toBe(roomAId);
    const row = db.prepare('SELECT room_id FROM characters WHERE id = ?').get(characterId) as { room_id: number };
    expect(row.room_id).toBe(roomAId);
    expect(isInCombat(ctx.session.ws)).toBe(true);
    expect(ctx.send).not.toHaveBeenCalledWith({ type: 'combatEnd' });
  });

  it('keeps fighting after failure and prevents rerolls until the cooldown expires', () => {
    const { roomAId, roomBId } = insertZoneWithRooms(true);
    const { accountId, characterId } = insertCharacter(roomAId);
    const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(TEST_MOB_TEMPLATE_ID) as MobTemplateRow;
    const mob = registerMobSpawn(-777003, roomAId, template, 60);
    createdSpawnIds.push(mob.spawnId);
    const ctx = makeContext(roomAId, characterId, accountId);
    startCombatInterval(ctx, [mob]);
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    handleFlee(ctx);
    expect(ctx.session.roomId).toBe(roomAId);
    expect(isInCombat(ctx.session.ws)).toBe(true);
    expect(db.prepare('SELECT room_id FROM characters WHERE id = ?').get(characterId)).toEqual({ room_id: roomAId });
    random.mockReturnValue(0);
    handleFlee(ctx);
    expect(random).toHaveBeenCalledTimes(1);
    expect(ctx.session.roomId).toBe(roomAId);
    now.mockReturnValue(12_000);
    handleFlee(ctx);
    expect(ctx.session.roomId).toBe(roomBId);
    expect(isInCombat(ctx.session.ws)).toBe(false);
  });

  it('cannot escape through blocked exits, named portals, or exits to the same room', () => {
    const { roomAId, roomBId } = insertZoneWithRooms(false);
    addExit(roomAId, 'east', roomBId, true);
    addExit(roomAId, 'north', roomAId);
    addExit(roomAId, 'portal', roomBId);
    const { accountId, characterId } = insertCharacter(roomAId);
    const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(TEST_MOB_TEMPLATE_ID) as MobTemplateRow;
    const mob = registerMobSpawn(-777004, roomAId, template, 60);
    createdSpawnIds.push(mob.spawnId);
    const ctx = makeContext(roomAId, characterId, accountId);
    startCombatInterval(ctx, [mob]);
    handleFlee(ctx);
    expect(ctx.session.roomId).toBe(roomAId);
    expect(isInCombat(ctx.session.ws)).toBe(true);
  });

  it('filters overlevel loot cached on an already spawned mob when it dies', () => {
    const { roomAId } = insertZoneWithRooms(false);
    const { accountId, characterId } = insertCharacter(roomAId);
    const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(TEST_MOB_TEMPLATE_ID) as MobTemplateRow;
    const mob = registerMobSpawn(-777005, roomAId, template, 60);
    createdSpawnIds.push(mob.spawnId);
    const highItem = db.prepare('SELECT id FROM items WHERE level > 20 LIMIT 1').get() as { id: number };
    mob.level = 20;
    mob.carriedItemIds = [1, highItem.id];
    const ctx = makeContext(roomAId, characterId, accountId);
    handleMobDefeat(ctx, mob, characterId);
    expect(db.prepare('SELECT item_id FROM room_items WHERE room_id = ?').all(roomAId)).toEqual([{ item_id: 1 }]);
  });
});
