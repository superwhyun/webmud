import { tickRespawns } from './MobManager.js';
import { tickResting } from './rest.js';
import { broadcastRoomSnapshot } from './roomSnapshot.js';

const TICK_MS = 1000;

export function startWorldTick(): void {
  setInterval(() => {
    const respawnedRoomIds = tickRespawns();
    for (const roomId of respawnedRoomIds) broadcastRoomSnapshot(roomId);
    tickResting();
  }, TICK_MS);
}
