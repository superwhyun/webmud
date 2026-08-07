import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db/client.js';
import { canDeleteRoom } from './roomGuard.js';

const cleanupRoomIds: number[] = [];

function insertRoom(): number {
  const info = db.prepare('INSERT INTO rooms (name, description) VALUES (?, ?)').run('테스트방', '테스트용 방');
  const id = Number(info.lastInsertRowid);
  cleanupRoomIds.push(id);
  return id;
}

afterEach(() => {
  while (cleanupRoomIds.length > 0) {
    const id = cleanupRoomIds.pop()!;
    db.prepare('DELETE FROM villages WHERE room_id = ?').run(id);
    db.prepare('DELETE FROM characters WHERE room_id = ?').run(id);
    db.prepare('DELETE FROM room_exits WHERE room_id = ? OR target_room_id = ?').run(id, id);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  }
});

describe('canDeleteRoom', () => {
  it('allows deleting an isolated room with no exits, characters, or village', () => {
    const roomId = insertRoom();
    expect(canDeleteRoom(roomId)).toEqual({ allowed: true });
  });

  it('blocks deleting a room that has an outgoing exit', () => {
    const roomId = insertRoom();
    const otherId = insertRoom();
    db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id) VALUES (?, ?, ?)').run(
      roomId,
      'north',
      otherId,
    );

    expect(canDeleteRoom(roomId).allowed).toBe(false);
  });

  it('blocks deleting a room that is the target of another room\'s exit', () => {
    const roomId = insertRoom();
    const otherId = insertRoom();
    db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id) VALUES (?, ?, ?)').run(
      otherId,
      'south',
      roomId,
    );

    expect(canDeleteRoom(roomId).allowed).toBe(false);
  });

  it('blocks deleting a room that has a character standing in it', () => {
    const roomId = insertRoom();
    const username = `guard_test_${Date.now()}`;
    const accountInfo = db
      .prepare('INSERT INTO accounts (username, password_hash) VALUES (?, ?)')
      .run(username, 'hash');
    const accountId = Number(accountInfo.lastInsertRowid);
    db.prepare(
      `INSERT INTO characters (account_id, name, room_id, hp, max_hp, strength, dexterity, physical_defense, magic_defense, element)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(accountId, `guard_char_${Date.now()}`, roomId, 20, 20, 5, 3, 2, 2, 'wood');

    expect(canDeleteRoom(roomId).allowed).toBe(false);

    db.prepare('DELETE FROM characters WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  });

  it('blocks deleting a village room', () => {
    const roomId = insertRoom();
    const username = `guard_lord_${Date.now()}`;
    const accountInfo = db
      .prepare('INSERT INTO accounts (username, password_hash) VALUES (?, ?)')
      .run(username, 'hash');
    const accountId = Number(accountInfo.lastInsertRowid);
    const otherRoomId = insertRoom();
    const charInfo = db
      .prepare(
        `INSERT INTO characters (account_id, name, room_id, hp, max_hp, strength, dexterity, physical_defense, magic_defense, element)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(accountId, `guard_lord_char_${Date.now()}`, otherRoomId, 20, 20, 5, 3, 2, 2, 'wood');
    const characterId = Number(charInfo.lastInsertRowid);
    db.prepare('INSERT INTO villages (name, room_id, lord_character_id) VALUES (?, ?, ?)').run(
      `guard_village_${Date.now()}`,
      roomId,
      characterId,
    );

    expect(canDeleteRoom(roomId).allowed).toBe(false);

    db.prepare('DELETE FROM villages WHERE room_id = ?').run(roomId);
    db.prepare('DELETE FROM characters WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  });
});
