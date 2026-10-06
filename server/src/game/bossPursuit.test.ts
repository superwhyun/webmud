import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { db } from '../db/client.js';
import type { MobTemplateRow } from '../db/types.js';
import { tickBossPursuits } from './bossPursuit.js';
import { bossPursuits, BOSS_CHASE_STEP_MS, BOSS_CHASE_TIMEOUT_MS } from './combat/bossPursuitState.js';
import { cleanupCombatForSession, getActiveCombat, handleFlee, startCombatInterval } from './combat/combatState.js';
import { defeatCharacter } from './combat/combatRewards.js';
import type { CommandContext } from './commands/context.js';
import { despawnMob, getMobsInRoom, killMob, registerMobSpawn, tickRespawns, type MobInstance } from './MobManager.js';
import { addSession, removeSession } from './sessionRegistry.js';
import { addExit, getRoom, registerRoom, unregisterRoom } from './World.js';

let zoneIds: number[];
let roomIds: number[];
let accountIds: number[];
let contexts: CommandContext[];
let mob: MobInstance;
let ctx: CommandContext;

function player(roomId: number): CommandContext {
  const accountId = Number(db.prepare('INSERT INTO accounts (username, password_hash) VALUES (?, ?)')
    .run(`chase-${accountIds.length}`, 'hash').lastInsertRowid);
  accountIds.push(accountId);
  const characterId = Number(db.prepare(
    `INSERT INTO characters (account_id, name, room_id, hp, max_hp, strength, dexterity, physical_defense, magic_defense, element)
     VALUES (?, ?, ?, 1000, 1000, 1, 10, 5, 5, 'fire')`,
  ).run(accountId, `chase-player-${accountId}`, roomId).lastInsertRowid);
  const ws = { send: vi.fn() } as unknown as WebSocket;
  const session = { ws, accountId, characterId, characterName: `chase-player-${accountId}`, roomId };
  addSession(session);
  const context = { session, send: vi.fn() };
  contexts.push(context);
  return context;
}

function relocate(context: CommandContext, roomId: number): void {
  context.session.roomId = roomId;
  db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(roomId, context.session.characterId);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  zoneIds = [];
  roomIds = [];
  accountIds = [];
  contexts = [];
  bossPursuits.clear();
  for (let i = 0; i < 2; i++) {
    zoneIds.push(Number(db.prepare('INSERT INTO zones (name, min_level, max_level) VALUES (?, 1, 5)')
      .run(`chase-zone-${i}`).lastInsertRowid));
  }
  for (let i = 0; i < 6; i++) {
    const zoneId = zoneIds[i === 5 ? 1 : 0];
    const id = Number(db.prepare('INSERT INTO rooms (name, description, zone_id) VALUES (?, ?, ?)')
      .run(`chase-room-${i}`, '', zoneId).lastInsertRowid);
    roomIds.push(id);
    registerRoom({ id, name: `chase-room-${i}`, description: '', x: i, y: 0, zoneId, exits: {} });
    if (i > 0) {
      addExit(roomIds[i - 1], 'east', id);
      addExit(id, 'west', roomIds[i - 1]);
    }
  }
  ctx = player(roomIds[0]);
  const template = db.prepare('SELECT * FROM mob_templates WHERE id = 1').get() as MobTemplateRow;
  mob = registerMobSpawn(-987001, roomIds[0], { ...template, is_boss: 1, hostile: 0 }, 1);
  mob.hp = 77;
  mob.maxHp = 1000;
  // Same-element, non-hostile boss: pursuit must work independently of normal elemental aggro.
  mob.element = 'fire';
  startCombatInterval(ctx, [mob]);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  handleFlee(ctx);
});

afterEach(() => {
  for (const context of contexts) {
    cleanupCombatForSession(context.session.ws);
    removeSession(context.session.ws);
    db.prepare('DELETE FROM characters WHERE id = ?').run(context.session.characterId);
  }
  for (const accountId of accountIds) db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  despawnMob(-987001);
  bossPursuits.clear();
  for (const roomId of roomIds) {
    unregisterRoom(roomId);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
  }
  for (const zoneId of zoneIds) db.prepare('DELETE FROM zones WHERE id = ?').run(zoneId);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('boss pursuit', () => {
  it('waits two seconds, moves to the neighboring room, and reengages the fleeing player', () => {
    expect(ctx.session.roomId).toBe(roomIds[1]);
    expect(getActiveCombat(ctx.session.ws)).toBeUndefined();
    tickBossPursuits(BOSS_CHASE_STEP_MS - 1);
    expect(mob.roomId).toBe(roomIds[0]);
    tickBossPursuits(BOSS_CHASE_STEP_MS);
    expect(mob.roomId).toBe(roomIds[1]);
    expect(getMobsInRoom(roomIds[0])).not.toContain(mob);
    expect(getMobsInRoom(roomIds[1])).toContain(mob);
    expect(getActiveCombat(ctx.session.ws)?.mobs).toContain(mob);
    expect(mob.hp).toBeLessThanOrEqual(77); // Reengagement may deal damage, but never heals the boss.
    expect(ctx.session.ws.send).toHaveBeenCalledWith(expect.stringContaining('쫓아 들어왔습니다'));
  });

  it('moves one room per step and returns with current HP when the target exceeds the three-room leash', () => {
    relocate(ctx, roomIds[3]);
    tickBossPursuits(2000);
    expect(mob.roomId).toBe(roomIds[1]);
    tickBossPursuits(3000);
    expect(mob.roomId).toBe(roomIds[1]);
    relocate(ctx, roomIds[4]);
    tickBossPursuits(4000);
    expect(mob.roomId).toBe(mob.homeRoomId);
    expect(mob.hp).toBe(77);
    expect(bossPursuits.size).toBe(0);
  });

  it('continues chasing after another successful flee without moving its home or healing', () => {
    tickBossPursuits(2000);
    const hp = mob.hp;
    getRoom(roomIds[1])!.exits.west.blocked = true;
    vi.setSystemTime(2000);
    handleFlee(ctx);
    expect(ctx.session.roomId).toBe(roomIds[2]);
    tickBossPursuits(4000);
    expect(mob.roomId).toBe(roomIds[2]);
    expect(mob.homeRoomId).toBe(roomIds[0]);
    expect(mob.hp).toBeLessThanOrEqual(hp);
    expect(getActiveCombat(ctx.session.ws)?.mobs).toContain(mob);
  });

  it('does not start a pursuit for ordinary monsters', () => {
    bossPursuits.clear();
    mob.isBoss = false;
    relocate(ctx, roomIds[0]);
    startCombatInterval(ctx, [mob]);
    handleFlee(ctx);
    expect(ctx.session.roomId).toBe(roomIds[1]);
    expect(bossPursuits.size).toBe(0);
    tickBossPursuits(2000);
    expect(mob.roomId).toBe(mob.homeRoomId);
  });

  it('gives up across zone boundaries', () => {
    relocate(ctx, roomIds[5]);
    tickBossPursuits(2000);
    expect(mob.roomId).toBe(mob.homeRoomId);
    expect(bossPursuits.size).toBe(0);
  });

  it('returns home after fifteen seconds without catching the target', () => {
    relocate(ctx, roomIds[3]);
    tickBossPursuits(2000);
    expect(mob.roomId).toBe(roomIds[1]);
    tickBossPursuits(BOSS_CHASE_TIMEOUT_MS);
    expect(mob.roomId).toBe(mob.homeRoomId);
    expect(mob.hp).toBe(77);
    expect(bossPursuits.size).toBe(0);
  });

  it('returns home when the target disconnects', () => {
    relocate(ctx, roomIds[3]);
    tickBossPursuits(2000);
    removeSession(ctx.session.ws);
    tickBossPursuits(3000);
    expect(mob.roomId).toBe(mob.homeRoomId);
    expect(bossPursuits.size).toBe(0);
  });

  it('ends pursuit on player death instead of chasing the respawned character', () => {
    tickBossPursuits(2000);
    defeatCharacter(ctx);
    cleanupCombatForSession(ctx.session.ws);
    tickBossPursuits(3000);
    expect(mob.roomId).toBe(mob.homeRoomId);
    expect(bossPursuits.size).toBe(0);
    expect(getActiveCombat(ctx.session.ws)).toBeUndefined();
  });

  it('respects blocked exits and does not substitute a named portal', () => {
    getRoom(roomIds[0])!.exits.east.blocked = true;
    addExit(roomIds[0], 'portal', roomIds[1]);
    tickBossPursuits(2000);
    expect(mob.roomId).toBe(mob.homeRoomId);
    expect(bossPursuits.size).toBe(0);
  });

  it('stays with another player still fighting it instead of leaving that fight', () => {
    const other = player(roomIds[0]);
    startCombatInterval(other, [mob]);
    tickBossPursuits(2000);
    expect(mob.roomId).toBe(mob.homeRoomId);
    expect(getActiveCombat(other.session.ws)?.mobs).toContain(mob);
    expect(getActiveCombat(ctx.session.ws)).toBeUndefined();
  });

  it('respawns at its original room after being killed during pursuit', () => {
    tickBossPursuits(2000);
    killMob(mob);
    cleanupCombatForSession(ctx.session.ws);
    tickBossPursuits(3000);
    expect(bossPursuits.size).toBe(0);
    vi.setSystemTime(2000);
    const respawned = tickRespawns().find((entry) => entry.mob === mob);
    expect(respawned?.roomId).toBe(mob.homeRoomId);
    expect(mob.alive).toBe(true);
  });
});
