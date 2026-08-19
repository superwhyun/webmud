import { describe, expect, it } from 'vitest';
import { EQUIPMENT_ART, PAPERDOLL_ART } from './equipmentAssets';
import { EQUIPMENT_SLOTS } from '@mud/shared';

describe('equipment artwork', () => {
  it('provides a project asset for every equipment slot', () => {
    expect(Object.keys(EQUIPMENT_ART).sort()).toEqual([...EQUIPMENT_SLOTS].sort());

    expect(Object.values(EQUIPMENT_ART).every((assetPath) => /^\/equipment\/[a-z-]+\.png$/.test(assetPath))).toBe(true);
  });

  it('provides the paper-doll artwork', () => {
    expect(PAPERDOLL_ART).toBe('/equipment/paperdoll.png');
  });
});
