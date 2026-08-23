import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CombatMobInfo, RoomMobInfo, RoomSnapshot } from '@mud/shared';
import type { GameContext } from './context';
import { MOB_SPRITES } from './mobSprites';
import { renderRoom, syncRoomMobsWithCombat } from './room';

function mob(name: string, isBoss = false): RoomMobInfo {
  return { spawnId: 1, name, hp: 10, maxHp: 10, level: 1, element: 'wood', isBoss };
}

describe('room combat HP sync', () => {
  it('updates only the room mob matched by spawn id without mutating the room snapshot', () => {
    const room = {
      mobs: [
        { ...mob('심해악어'), spawnId: 10 },
        { ...mob('빙하의 여왕', true), spawnId: 20, hp: 3618, maxHp: 3618 },
      ],
    } as RoomSnapshot;
    const combatMobs: CombatMobInfo[] = [
      {
        spawnId: 20,
        name: '빙하의 여왕',
        hp: 3516,
        maxHp: 3618,
        element: 'water',
        isBoss: true,
      },
    ];

    const synced = syncRoomMobsWithCombat(room, combatMobs);

    expect(synced).not.toBe(room);
    expect(synced.mobs).not.toBe(room.mobs);
    expect(synced.mobs).toEqual([
      room.mobs[0],
      { ...room.mobs[1], hp: 3516, maxHp: 3618 },
    ]);
    expect(room.mobs[1].hp).toBe(3618);
  });
});

describe('room mob sprites', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders every registered mob and ignores inherited object keys', () => {
    vi.stubGlobal('document', {
      createElement: () => {
        let innerHTML = '';
        return {
          get innerHTML() {
            return innerHTML;
          },
          set textContent(value: string) {
            innerHTML = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
          },
        };
      },
    });

    const registeredMobNames = Object.keys(MOB_SPRITES);
    const roomHeader = { innerHTML: '' } as HTMLDivElement;
    const roomMeta = { innerHTML: '' } as HTMLDivElement;
    const roomVillage = { innerHTML: '' } as HTMLDivElement;
    const mobSpriteRow = { innerHTML: '' } as HTMLDivElement;
    const ctx = {
      roomHeader,
      roomMeta,
      roomVillage,
      mobSpriteRow,
      currentCharacterState: undefined,
    } as GameContext;
    const room: RoomSnapshot = {
      id: 1,
      name: '테스트 방',
      description: '스프라이트 테스트',
      zoneId: 1,
      zoneName: '테스트 존',
      exits: [],
      items: [],
      mobs: [...registeredMobNames.map((name, index) => mob(name, index === 0)), mob('toString')],
      npcs: [],
      players: [],
    };

    renderRoom(ctx, room);

    expect(mobSpriteRow.innerHTML.match(/class="mob-sprite"/g)?.length ?? 0).toBe(registeredMobNames.length);
    for (const name of registeredMobNames) {
      expect(mobSpriteRow.innerHTML).toContain(`src="${MOB_SPRITES[name]}"`);
      expect(mobSpriteRow.innerHTML).toContain(`alt="${name}"`);
      expect(mobSpriteRow.innerHTML).toContain(`title="${name} Lv.1"`);
    }
    expect(mobSpriteRow.innerHTML).not.toContain('toString');
    expect(roomMeta.innerHTML).toContain('mob-boss-badge');
    expect(mobSpriteRow.innerHTML).toContain('data-boss="true"');
  });

  it('escapes builder-controlled room names and descriptions', () => {
    vi.stubGlobal('document', {
      createElement: () => {
        let innerHTML = '';
        return {
          get innerHTML() {
            return innerHTML;
          },
          set textContent(value: string) {
            innerHTML = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
          },
        };
      },
    });

    const roomHeader = { innerHTML: '' } as HTMLDivElement;
    const ctx = {
      roomHeader,
      roomMeta: { innerHTML: '' },
      roomVillage: { innerHTML: '' },
      mobSpriteRow: { innerHTML: '' },
      currentCharacterState: undefined,
    } as GameContext;
    const room: RoomSnapshot = {
      id: 1,
      name: '<img src=x onerror=attack()>',
      description: '<script>attack()</script>',
      zoneId: 1,
      zoneName: '테스트 존',
      exits: [],
      items: [],
      mobs: [],
      npcs: [],
      players: [],
    };

    renderRoom(ctx, room);

    expect(roomHeader.innerHTML).toContain('&lt;img src=x onerror=attack()&gt;');
    expect(roomHeader.innerHTML).toContain('&lt;script&gt;attack()&lt;/script&gt;');
    expect(roomHeader.innerHTML).not.toContain('<img src=x');
    expect(roomHeader.innerHTML).not.toContain('<script>');
  });
});
