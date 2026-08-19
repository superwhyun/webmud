import type { EquipmentSlot } from '@mud/shared';

const EQUIPMENT_ASSET_ROOT = '/equipment';

export const PAPERDOLL_ART = `${EQUIPMENT_ASSET_ROOT}/paperdoll.png`;

export const EQUIPMENT_ART: Record<EquipmentSlot, string> = {
  hat: `${EQUIPMENT_ASSET_ROOT}/hat.png`,
  earring: `${EQUIPMENT_ASSET_ROOT}/earring.png`,
  necklace: `${EQUIPMENT_ASSET_ROOT}/necklace.png`,
  top: `${EQUIPMENT_ASSET_ROOT}/top.png`,
  bottom: `${EQUIPMENT_ASSET_ROOT}/bottom.png`,
  gloves: `${EQUIPMENT_ASSET_ROOT}/gloves.png`,
  shoes: `${EQUIPMENT_ASSET_ROOT}/shoes.png`,
  weapon: `${EQUIPMENT_ASSET_ROOT}/weapon.png`,
  shield: `${EQUIPMENT_ASSET_ROOT}/shield.png`,
  ring: `${EQUIPMENT_ASSET_ROOT}/ring.png`,
};

export function equipmentArt(slot: EquipmentSlot, className = ''): string {
  return `<img class="equipment-art ${className}" src="${EQUIPMENT_ART[slot]}" alt="" aria-hidden="true" draggable="false" />`;
}
