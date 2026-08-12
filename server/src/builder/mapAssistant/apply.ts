import { createRoomItemRecord } from '../items.js';
import { createMobSpawnRecord } from '../mobs.js';
import { createRoomRecord } from '../rooms.js';
import type { ProposedOperation } from './operations.js';

export interface ApplyResult {
  operation: ProposedOperation;
  success: boolean;
  error?: string;
}

function resolveRoomId(roomRef: string, tempIdToRealRoomId: Map<string, number>): number | null {
  if (roomRef.startsWith('new:')) {
    return tempIdToRealRoomId.get(roomRef) ?? null;
  }
  const id = Number(roomRef);
  return Number.isInteger(id) ? id : null;
}

/**
 * Re-validates and executes each proposed operation against the live DB, in order. `add_room` operations
 * populate a tempId → real room id map that later operations in the same batch resolve `roomRef` against
 * (the client may have unchecked some proposed rooms, in which case dependent ops fail explicitly below
 * rather than silently pointing at a room that was never created).
 */
export function applyOperations(zoneId: number, operations: ProposedOperation[]): ApplyResult[] {
  const tempIdToRealRoomId = new Map<string, number>();
  const results: ApplyResult[] = [];

  for (const operation of operations) {
    if (operation.type === 'add_room') {
      const outcome = createRoomRecord({
        name: operation.name,
        description: operation.description,
        x: operation.x,
        y: operation.y,
        zoneId,
      });
      if ('error' in outcome) {
        results.push({ operation, success: false, error: outcome.error });
        continue;
      }
      tempIdToRealRoomId.set(operation.tempId, outcome.room.id);
      results.push({ operation, success: true });
      continue;
    }

    const roomId = resolveRoomId(operation.roomRef, tempIdToRealRoomId);
    if (roomId === null) {
      results.push({ operation, success: false, error: `방을 찾을 수 없습니다: ${operation.roomLabel}` });
      continue;
    }

    if (operation.type === 'add_mob_spawn') {
      const outcome = createMobSpawnRecord({
        roomId,
        mobTemplateId: operation.mobTemplateId,
        respawnSeconds: operation.respawnSeconds,
      });
      results.push(
        'error' in outcome
          ? { operation, success: false, error: outcome.error }
          : { operation, success: true },
      );
      continue;
    }

    const outcome = createRoomItemRecord({ roomId, itemId: operation.itemId, quantity: operation.quantity });
    results.push(
      'error' in outcome ? { operation, success: false, error: outcome.error } : { operation, success: true },
    );
  }

  return results;
}
