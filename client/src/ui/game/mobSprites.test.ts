import { describe, expect, it } from 'vitest';
import { MOB_SPRITES } from './mobSprites';

/** server/src/db/seed/mobs/base.ts의 클라이언트 표시 계약 스냅샷. */
export const SEEDED_MOB_NAMES = [
  '쥐',
  '고블린',
  '덩굴괴수',
  '가시덩굴괴수',
  '맹독가시괴수',
  '심연의 덩굴괴수',
  '태고의 덩굴괴수',
  '불도마뱀',
  '화염도마뱀',
  '작열도마뱀',
  '지옥불도마뱀',
  '태고의 불도마뱀',
  '바위골렘',
  '강철골렘',
  '흑요석골렘',
  '심연의 골렘',
  '태고의 골렘',
  '강철전갈',
  '독침전갈',
  '사혈전갈',
  '흑철전갈',
  '태고의 전갈',
  '늪지악어',
  '심해악어',
  '빙하악어',
  '폭풍악어',
  '태고의 악어',
] as const;

describe('mob sprite catalog', () => {
  it('maps every seeded mob to its own project PNG', () => {
    const paths = Object.values(MOB_SPRITES);

    expect(Object.keys(MOB_SPRITES).sort()).toEqual([...SEEDED_MOB_NAMES].sort());
    expect(new Set(paths).size).toBe(SEEDED_MOB_NAMES.length);
    expect(paths.every((path) => /^\/mobs\/[a-z0-9-]+\.png$/.test(path))).toBe(true);
  });
});
