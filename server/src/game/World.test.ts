import { afterEach, describe, expect, it } from 'vitest';
import { addExit, getRoom, removeExit, updateRoom } from './World.js';

const TEST_ROOM_ID = 1;
let originalName: string;
let originalDescription: string;

afterEach(() => {
  if (originalName !== undefined) {
    updateRoom(TEST_ROOM_ID, { name: originalName, description: originalDescription });
  }
  const room = getRoom(TEST_ROOM_ID);
  if (room) {
    delete room.exits.up;
    delete room.exits.down;
  }
});

describe('updateRoom', () => {
  it('updates name and description in place', () => {
    const room = getRoom(TEST_ROOM_ID)!;
    originalName = room.name;
    originalDescription = room.description;

    updateRoom(TEST_ROOM_ID, { name: '임시 이름', description: '임시 설명' });

    expect(getRoom(TEST_ROOM_ID)!.name).toBe('임시 이름');
    expect(getRoom(TEST_ROOM_ID)!.description).toBe('임시 설명');
  });

  it('leaves fields untouched when omitted from the patch', () => {
    const room = getRoom(TEST_ROOM_ID)!;
    originalName = room.name;
    originalDescription = room.description;

    updateRoom(TEST_ROOM_ID, { name: '이름만 변경' });

    expect(getRoom(TEST_ROOM_ID)!.name).toBe('이름만 변경');
    expect(getRoom(TEST_ROOM_ID)!.description).toBe(originalDescription);
  });

  it('does nothing for an unknown room id', () => {
    expect(() => updateRoom(999999, { name: 'x' })).not.toThrow();
  });
});

describe('addExit / removeExit', () => {
  it('adds a new direction to the in-memory room', () => {
    addExit(TEST_ROOM_ID, 'up', 2);
    expect(getRoom(TEST_ROOM_ID)!.exits.up).toBe(2);
  });

  it('removes a direction from the in-memory room', () => {
    addExit(TEST_ROOM_ID, 'down', 2);
    removeExit(TEST_ROOM_ID, 'down');
    expect(getRoom(TEST_ROOM_ID)!.exits.down).toBeUndefined();
  });

  it('does nothing for an unknown room id', () => {
    expect(() => addExit(999999, 'up', 2)).not.toThrow();
    expect(() => removeExit(999999, 'up')).not.toThrow();
  });
});
