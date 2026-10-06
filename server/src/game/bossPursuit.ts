import { DIRECTION_VALUES } from '@mud/shared';
import { getMobCombatContext, startCombat } from './combat/combatState.js';
import { bossPursuits, BOSS_CHASE_RADIUS, BOSS_CHASE_STEP_MS, BOSS_CHASE_TIMEOUT_MS } from './combat/bossPursuitState.js';
import { getMobBySpawnId, type MobInstance } from './MobManager.js';
import { broadcastRoomSnapshot } from './roomSnapshot.js';
import { broadcastToRoom, getSession } from './sessionRegistry.js';
import { getRoom } from './World.js';
import { send } from './wsUtil.js';

function neighbors(roomId: number, zoneId: number): number[] {
  const room = getRoom(roomId);
  if (!room) return [];
  return DIRECTION_VALUES.flatMap((direction) => {
    const exit = room.exits[direction];
    return exit && !exit.blocked && getRoom(exit.targetRoomId)?.zoneId === zoneId ? [exit.targetRoomId] : [];
  });
}

/** Only open, ordinary room exits in the home zone count toward the leash. */
function chaseArea(homeRoomId: number): Set<number> {
  const zoneId = getRoom(homeRoomId)?.zoneId;
  const allowed = new Set([homeRoomId]);
  if (zoneId === undefined) return allowed;
  let frontier = [homeRoomId];
  for (let depth = 0; depth < BOSS_CHASE_RADIUS; depth++) {
    const next: number[] = [];
    for (const roomId of frontier) {
      for (const neighbor of neighbors(roomId, zoneId)) {
        if (allowed.has(neighbor)) continue;
        allowed.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return allowed;
}

function nextStep(from: number, target: number, allowed: Set<number>, zoneId: number): number | undefined {
  const queue = [{ roomId: from, firstStep: from }];
  const seen = new Set([from]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const roomId of neighbors(current.roomId, zoneId)) {
      if (!allowed.has(roomId) || seen.has(roomId)) continue;
      const firstStep = current.roomId === from ? roomId : current.firstStep;
      if (roomId === target) return firstStep;
      seen.add(roomId);
      queue.push({ roomId, firstStep });
    }
  }
  return undefined;
}

function moveBoss(mob: MobInstance, roomId: number, returning = false): void {
  const oldRoomId = mob.roomId;
  if (oldRoomId === roomId) return;
  broadcastToRoom(oldRoomId, { type: 'text', text: returning
    ? `${mob.name}이(가) 추적을 포기하고 원래 자리로 돌아갑니다.`
    : `${mob.name}이(가) 도망친 상대를 쫓아갑니다.` });
  mob.roomId = roomId;
  broadcastToRoom(roomId, { type: 'text', text: returning
    ? `${mob.name}이(가) 원래 자리로 돌아왔습니다.`
    : `${mob.name}이(가) 쫓아 들어왔습니다!` });
  broadcastRoomSnapshot(oldRoomId);
  broadcastRoomSnapshot(roomId);
}

export function tickBossPursuits(now = Date.now()): void {
  for (const [spawnId, pursuit] of bossPursuits) {
    const { mob } = pursuit;
    if (!mob.alive || getMobBySpawnId(spawnId) !== mob) {
      bossPursuits.delete(spawnId);
      continue;
    }
    const fighting = getMobCombatContext(mob);
    if (fighting) {
      pursuit.targetWs = fighting.session.ws;
      pursuit.expiresAt = now + BOSS_CHASE_TIMEOUT_MS;
      continue;
    }
    const target = pursuit.targetWs && getSession(pursuit.targetWs);
    const allowed = chaseArea(mob.homeRoomId);
    if (!target || now >= pursuit.expiresAt || !allowed.has(target.roomId) || !allowed.has(mob.roomId)) {
      moveBoss(mob, mob.homeRoomId, true);
      bossPursuits.delete(spawnId);
      continue;
    }
    if (now < pursuit.nextMoveAt) continue;
    pursuit.nextMoveAt = now + BOSS_CHASE_STEP_MS;
    if (mob.roomId !== target.roomId) {
      const zoneId = getRoom(mob.homeRoomId)?.zoneId;
      const roomId = zoneId === undefined ? undefined : nextStep(mob.roomId, target.roomId, allowed, zoneId);
      if (roomId === undefined) {
        moveBoss(mob, mob.homeRoomId, true);
        bossPursuits.delete(spawnId);
        continue;
      }
      moveBoss(mob, roomId);
    }
    if (mob.roomId === target.roomId) {
      // Pursuit ignores elemental aggro conditions: this is the opponent that fled.
      startCombat({ session: target, send: (message) => send(target.ws, message) }, mob);
    }
  }
}
