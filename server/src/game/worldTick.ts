import { announceBossSpawned } from './bossAnnounce.js';
import { tickRespawns } from './MobManager.js';
import { tickResting } from './rest.js';
import { broadcastRoomSnapshot } from './roomSnapshot.js';

const TICK_MS = 1000;

export function startWorldTick(): void {
  setInterval(() => {
    const respawned = tickRespawns();
    for (const { roomId } of respawned) broadcastRoomSnapshot(roomId);
    for (const { roomId, mob } of respawned) {
      if (mob.isBoss) announceBossSpawned(roomId, mob.name);
    }
    tickResting();
  }, TICK_MS);
}
