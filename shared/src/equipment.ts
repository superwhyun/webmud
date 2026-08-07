export type EquipmentSlot =
  | 'hat'
  | 'earring'
  | 'necklace'
  | 'top'
  | 'bottom'
  | 'gloves'
  | 'shoes'
  | 'weapon'
  | 'shield'
  | 'ring';

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  'hat',
  'earring',
  'necklace',
  'top',
  'bottom',
  'gloves',
  'shoes',
  'weapon',
  'shield',
  'ring',
];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  hat: '모자',
  earring: '귀걸이',
  necklace: '목걸이',
  top: '상의',
  bottom: '하의',
  gloves: '장갑',
  shoes: '신발',
  weapon: '무기',
  shield: '방패',
  ring: '반지',
};
