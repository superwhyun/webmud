import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobTemplateDto } from '../../builderApi';
import type { BuilderContext } from './context';
import { renderPalette } from './palette';

function mob(id: number, name: string, isBoss: boolean): MobTemplateDto {
  return {
    id,
    name,
    hp: 10,
    hpMax: 100,
    strength: 1,
    strengthMax: 10,
    dexterity: 1,
    dexterityMax: 10,
    physicalDefense: 0,
    physicalDefenseMax: 10,
    magicDefense: 0,
    magicDefenseMax: 10,
    element: 'fire',
    damageType: 'physical',
    expReward: 5,
    expRewardMax: 50,
    goldReward: 1,
    goldRewardMax: 10,
    minLevel: 1,
    maxLevel: 50,
    hostile: true,
    isBoss,
  };
}

function context(): BuilderContext {
  const palette = {
    innerHTML: '',
    querySelectorAll: () => [],
  } as unknown as HTMLDivElement;
  return {
    palette,
    panel: { querySelector: () => null } as unknown as HTMLDivElement,
    token: 'test',
    selectedRoomId: 1,
    selectedZoneId: 1,
    rooms: [{ id: 1, name: '보스방', description: '', x: 0, y: 0, zoneId: 1, exits: [] }],
    zones: [{ id: 1, name: '첫 존', description: '', minLevel: 6, maxLevel: 10 }],
    itemTemplates: [],
    mobTemplates: [mob(1, '일반몹', false), mob(2, '보스몹', true)],
    roomItems: [],
    mobSpawns: [],
    npcTemplates: [],
    npcSpawns: [],
    expandedItemGrades: new Set(),
    expandedMobLevelBrackets: new Set([1]),
    expandedNpcTypes: new Set(),
  } as unknown as BuilderContext;
}

describe('builder boss palette', () => {
  beforeEach(() => {
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
  });

  afterEach(() => vi.unstubAllGlobals());

  it('separates bosses and shows their fixed zone level without random range inputs', () => {
    const ctx = context();

    renderPalette(ctx);

    expect(ctx.palette.innerHTML).toContain('<h3>보스</h3>');
    expect(ctx.palette.innerHTML).toContain('보스몹');
    expect(ctx.palette.innerHTML).toContain('존 기준 Lv.10 고정');
    expect(ctx.palette.innerHTML).toContain('class="builder-boss-badge"');
    expect(ctx.palette.innerHTML).not.toContain('data-mob-min-level="2"');
    expect(ctx.palette.innerHTML).not.toContain('data-mob-max-level="2"');
  });

  it('keeps random level range inputs for ordinary mobs', () => {
    const ctx = context();

    renderPalette(ctx);

    expect(ctx.palette.innerHTML).toContain('data-mob-min-level="1"');
    expect(ctx.palette.innerHTML).toContain('data-mob-max-level="1"');
  });
});
