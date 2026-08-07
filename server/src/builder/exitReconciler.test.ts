import { describe, expect, it } from 'vitest';
import { reconcileExits } from './exitReconciler.js';

describe('reconcileExits', () => {
  it('creates bidirectional exits between newly adjacent rooms', () => {
    const rooms = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
    ];

    const diff = reconcileExits(rooms, []);

    expect(diff.toUpsert).toContainEqual({ roomId: 1, direction: 'east', targetRoomId: 2 });
    expect(diff.toUpsert).toContainEqual({ roomId: 2, direction: 'west', targetRoomId: 1 });
    expect(diff.toRemove).toEqual([]);
  });

  it('removes exits when rooms are no longer adjacent', () => {
    const rooms = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 5, y: 5 },
    ];
    const existing = [
      { roomId: 1, direction: 'east' as const, targetRoomId: 2 },
      { roomId: 2, direction: 'west' as const, targetRoomId: 1 },
    ];

    const diff = reconcileExits(rooms, existing);

    expect(diff.toUpsert).toEqual([]);
    expect(diff.toRemove).toContainEqual({ roomId: 1, direction: 'east' });
    expect(diff.toRemove).toContainEqual({ roomId: 2, direction: 'west' });
  });

  it('preserves an existing exit (and its blocked flag) when adjacency is unchanged', () => {
    const rooms = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 0, y: 1 },
    ];
    const existing = [
      { roomId: 1, direction: 'south' as const, targetRoomId: 2 },
      { roomId: 2, direction: 'north' as const, targetRoomId: 1 },
    ];

    const diff = reconcileExits(rooms, existing);

    expect(diff.toUpsert).toEqual([]);
    expect(diff.toRemove).toEqual([]);
  });

  it('re-links a direction when a different room moves into an old neighbor cell', () => {
    const rooms = [
      { id: 1, x: 0, y: 0 },
      { id: 3, x: 1, y: 0 },
    ];
    const existing = [{ roomId: 1, direction: 'east' as const, targetRoomId: 2 }];

    const diff = reconcileExits(rooms, existing);

    expect(diff.toUpsert).toContainEqual({ roomId: 1, direction: 'east', targetRoomId: 3 });
  });

  it('ignores rooms with no grid neighbors', () => {
    const rooms = [{ id: 1, x: 0, y: 0 }];

    const diff = reconcileExits(rooms, []);

    expect(diff.toUpsert).toEqual([]);
    expect(diff.toRemove).toEqual([]);
  });
});
