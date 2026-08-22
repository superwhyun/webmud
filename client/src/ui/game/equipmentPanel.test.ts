import { afterEach, describe, expect, it, vi } from 'vitest';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, type InventoryItemInfo } from '@mud/shared';
import { renderEquipmentPanel } from './equipment';
import type { GameContext } from './context';

const equippedHat: InventoryItemInfo = {
  inventoryId: 1,
  name: '<가죽 "모자">',
  quantity: 1,
  equipped: true,
  slot: 'hat',
  grade: 'low',
  level: 1,
  healAmount: 0,
  manaAmount: 0,
  strengthBonus: 0,
  dexterityBonus: 0,
  intelligenceBonus: 0,
  physicalDefenseBonus: 1,
  magicDefenseBonus: 0,
  attackPowerBonus: 0,
  value: 10,
};

describe('sidebar equipment panel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders every slot as an illustrated board entry without losing names or empty states', () => {
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

    const equipmentPanel = { innerHTML: '' } as HTMLDivElement;
    const ctx = {
      equipmentPanel,
      equipmentState: { hat: equippedHat },
    } as GameContext;

    renderEquipmentPanel(ctx);

    expect(equipmentPanel.innerHTML).toContain('class="equipment-panel-heading"');
    expect(equipmentPanel.innerHTML).toContain('class="equipment-panel-count">1/10');
    expect(equipmentPanel.innerHTML.match(/class="equipment-slot /g)?.length ?? 0).toBe(EQUIPMENT_SLOTS.length);
    expect(equipmentPanel.innerHTML.match(/equipment-slot-art-image/g)?.length ?? 0).toBe(EQUIPMENT_SLOTS.length);
    for (const label of Object.values(EQUIPMENT_SLOT_LABELS)) expect(equipmentPanel.innerHTML).toContain(label);
    expect(equipmentPanel.innerHTML).toContain('&lt;가죽 "모자"&gt;');
    expect(equipmentPanel.innerHTML).not.toContain('><가죽 "모자"><');
    expect(equipmentPanel.innerHTML.match(/비어있음/g)?.length ?? 0).toBe(EQUIPMENT_SLOTS.length - 1);
  });
});
