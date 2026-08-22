import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomMobInfo, RoomSnapshot } from '@mud/shared';
import type { GameContext } from './context';
import { MOB_SPRITES } from './mobSprites';
import { renderRoom } from './room';

function mob(name: string): RoomMobInfo {
  return { name, hp: 10, maxHp: 10, level: 1, element: 'wood' };
}

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
      mobs: [...registeredMobNames.map(mob), mob('toString')],
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
