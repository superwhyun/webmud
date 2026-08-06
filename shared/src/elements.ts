export type ElementType = 'wood' | 'fire' | 'earth' | 'metal' | 'water';

export const ELEMENT_VALUES: ElementType[] = ['wood', 'fire', 'earth', 'metal', 'water'];

export const ELEMENT_LABELS: Record<ElementType, string> = {
  wood: '목(木)',
  fire: '화(火)',
  earth: '토(土)',
  metal: '금(金)',
  water: '수(水)',
};

/** 상극: key 속성이 value 속성을 이긴다 (화>금>목>토>수>화). */
export const ELEMENT_ADVANTAGE: Record<ElementType, ElementType> = {
  fire: 'metal',
  metal: 'wood',
  wood: 'earth',
  earth: 'water',
  water: 'fire',
};
