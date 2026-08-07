import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@mud/shared';
import { db } from '../db/client.js';
import { addSession, removeSession, type Session } from '../game/sessionRegistry.js';
import { forceMoveSession, kickSession } from './moderation.js';

interface FakeSession {
  session: Session;
  sent: ServerMessage[];
  closeSpy: ReturnType<typeof vi.fn>;
}

const cleanupAccountIds: number[] = [];

function insertTestCharacter(roomId: number): { characterId: number; characterName: string } {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const accountInfo = db
    .prepare('INSERT INTO accounts (username, password_hash) VALUES (?, ?)')
    .run(`mod_test_${suffix}`, 'hash');
  const accountId = Number(accountInfo.lastInsertRowid);
  cleanupAccountIds.push(accountId);

  const characterName = `mod_char_${suffix}`;
  const charInfo = db
    .prepare(
      `INSERT INTO characters (account_id, name, room_id, hp, max_hp, strength, dexterity, physical_defense, magic_defense, element)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(accountId, characterName, roomId, 20, 20, 5, 3, 2, 2, 'wood');

  return { characterId: Number(charInfo.lastInsertRowid), characterName };
}

function createFakeSession(characterId: number, characterName: string, roomId: number): FakeSession {
  const sent: ServerMessage[] = [];
  const closeSpy = vi.fn();
  const ws = {
    send: (data: string) => sent.push(JSON.parse(data) as ServerMessage),
    close: closeSpy,
  } as unknown as Session['ws'];

  const session: Session = { ws, accountId: characterId, characterId, characterName, roomId };
  addSession(session);
  return { session, sent, closeSpy };
}

afterEach(() => {
  while (cleanupAccountIds.length > 0) {
    const accountId = cleanupAccountIds.pop()!;
    db.prepare('DELETE FROM characters WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  }
});

describe('forceMoveSession', () => {
  it('moves the session to a valid target room and syncs state', () => {
    const { characterId, characterName } = insertTestCharacter(1);
    const fake = createFakeSession(characterId, characterName, 1);

    const result = forceMoveSession(fake.session, 2);

    expect(result).toEqual({ ok: true });
    expect(fake.session.roomId).toBe(2);

    const row = db.prepare('SELECT room_id FROM characters WHERE id = ?').get(characterId) as { room_id: number };
    expect(row.room_id).toBe(2);

    removeSession(fake.session.ws);
  });

  it('rejects an unknown target room', () => {
    const { characterId, characterName } = insertTestCharacter(1);
    const fake = createFakeSession(characterId, characterName, 1);

    const result = forceMoveSession(fake.session, 999999);

    expect(result.ok).toBe(false);
    expect(fake.session.roomId).toBe(1);

    removeSession(fake.session.ws);
  });

  it('rejects moving to the room the character is already in', () => {
    const { characterId, characterName } = insertTestCharacter(1);
    const fake = createFakeSession(characterId, characterName, 1);

    const result = forceMoveSession(fake.session, 1);

    expect(result.ok).toBe(false);

    removeSession(fake.session.ws);
  });
});

describe('kickSession', () => {
  it('sends a reason and closes the socket', () => {
    const { characterId, characterName } = insertTestCharacter(1);
    const fake = createFakeSession(characterId, characterName, 1);

    kickSession(fake.session, '규칙 위반');

    expect(fake.sent.some((message) => message.type === 'error')).toBe(true);
    expect(fake.closeSpy).toHaveBeenCalledOnce();

    removeSession(fake.session.ws);
  });

  it('works without a reason', () => {
    const { characterId, characterName } = insertTestCharacter(1);
    const fake = createFakeSession(characterId, characterName, 1);

    kickSession(fake.session);

    expect(fake.closeSpy).toHaveBeenCalledOnce();

    removeSession(fake.session.ws);
  });
});
