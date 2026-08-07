export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

export interface RoomPosition {
  id: number;
  x: number;
  y: number;
}

export interface ExistingExit {
  roomId: number;
  direction: CardinalDirection;
  targetRoomId: number;
}

export interface ExitUpsert {
  roomId: number;
  direction: CardinalDirection;
  targetRoomId: number;
}

export interface ExitRemoval {
  roomId: number;
  direction: CardinalDirection;
}

export interface ExitDiff {
  toUpsert: ExitUpsert[];
  toRemove: ExitRemoval[];
}

export const CARDINAL_OFFSET: Record<CardinalDirection, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

/**
 * Derives the desired north/south/east/west exit graph purely from grid positions and
 * diffs it against the current exit rows. Exits between grid-adjacent rooms are upserted
 * with blocked=false (only when missing or pointing at a stale target); exits whose
 * adjacency no longer holds are removed. Exits already correctly pointing at the current
 * neighbor are left untouched so their `blocked` flag is preserved.
 */
export function reconcileExits(rooms: RoomPosition[], existingExits: ExistingExit[]): ExitDiff {
  const roomIdByCell = new Map<string, number>();
  for (const room of rooms) roomIdByCell.set(`${room.x},${room.y}`, room.id);

  const existingByKey = new Map<string, ExistingExit>();
  for (const exit of existingExits) existingByKey.set(`${exit.roomId}:${exit.direction}`, exit);

  const desiredKeys = new Set<string>();
  const toUpsert: ExitUpsert[] = [];

  for (const room of rooms) {
    for (const direction of Object.keys(CARDINAL_OFFSET) as CardinalDirection[]) {
      const offset = CARDINAL_OFFSET[direction];
      const neighborId = roomIdByCell.get(`${room.x + offset.dx},${room.y + offset.dy}`);
      if (neighborId === undefined) continue;

      const key = `${room.id}:${direction}`;
      desiredKeys.add(key);
      const existing = existingByKey.get(key);
      if (!existing || existing.targetRoomId !== neighborId) {
        toUpsert.push({ roomId: room.id, direction, targetRoomId: neighborId });
      }
    }
  }

  const toRemove: ExitRemoval[] = [];
  for (const exit of existingExits) {
    const key = `${exit.roomId}:${exit.direction}`;
    if (!desiredKeys.has(key)) toRemove.push({ roomId: exit.roomId, direction: exit.direction });
  }

  return { toUpsert, toRemove };
}
