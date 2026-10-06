import { announceBossSpawned } from './bossAnnounce.js';
import { tickRespawns } from './MobManager.js';
import { tickResting } from './rest.js';
import { broadcastRoomSnapshot } from './roomSnapshot.js';
import { tickBossPursuits } from './bossPursuit.js';

const TICK_MS = 1000;

export function startWorldTick(): () => void {
  const timer = setInterval(() => {
    tickBossPursuits();
    const respawned = tickRespawns();
    for (const { roomId } of respawned) broadcastRoomSnapshot(roomId);
    for (const { roomId, mob } of respawned) {
      if (mob.isBoss) announceBossSpawned(roomId, mob.name);
    }
    tickResting();
  }, TICK_MS);
  return () => clearInterval(timer);
}
