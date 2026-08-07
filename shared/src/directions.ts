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
