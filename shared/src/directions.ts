export const DIRECTION_LABELS: Record<string, string> = {
  north: '북쪽',
  south: '남쪽',
  east: '동쪽',
  west: '서쪽',
  up: '위',
  down: '아래',
};

export const OPPOSITE_DIRECTION: Record<string, string> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  up: 'down',
  down: 'up',
};

export const DIRECTION_VALUES: string[] = Object.keys(DIRECTION_LABELS);

// WASD 배치: w=북, a=서, s=남, d=동. e는 enter(포털) 단축 verb라 방향에 없음.
/** 한영전환 없이 두벌식 자판으로 wasd를 누르면 나오는 자모(ㅈ/ㅁ/ㄴ/ㅇ)도 서버와 동일하게 받아준다. */
export const CARDINAL_ALIASES: Readonly<Record<string, 'north' | 'south' | 'east' | 'west'>> = {
  north: 'north',
  w: 'north',
  ㅈ: 'north',
  south: 'south',
  s: 'south',
  ㄴ: 'south',
  east: 'east',
  d: 'east',
  ㅇ: 'east',
  west: 'west',
  a: 'west',
  ㅁ: 'west',
};

/** Includes vertical movement; e remains the portal-enter alias. */
export const DIRECTION_ALIASES: Readonly<Record<string, string>> = {
  ...CARDINAL_ALIASES,
  up: 'up',
  u: 'up',
  down: 'down',
};
