import type { WebSocket } from 'ws';
import type { MobInstance } from '../mobs/types.js';

export const BOSS_CHASE_RADIUS = 3;
export const BOSS_CHASE_STEP_MS = 2000;
export const BOSS_CHASE_TIMEOUT_MS = 15_000;

interface BossPursuit {
  mob: MobInstance;
  targetWs: WebSocket | undefined;
  expiresAt: number;
  nextMoveAt: number;
}

export const bossPursuits = new Map<number, BossPursuit>();

export function pursueFleeingPlayer(mobs: readonly MobInstance[], targetWs: WebSocket, now = Date.now()): void {
  for (const mob of mobs) {
    if (!mob.isBoss || !mob.alive) continue;
    bossPursuits.set(mob.spawnId, {
      mob, targetWs, expiresAt: now + BOSS_CHASE_TIMEOUT_MS, nextMoveAt: now + BOSS_CHASE_STEP_MS,
    });
  }
}

export function abandonBossPursuit(targetWs: WebSocket): void {
  for (const pursuit of bossPursuits.values()) {
    if (pursuit.targetWs === targetWs) pursuit.targetWs = undefined;
  }
}
