export type ItemGrade = 'low' | 'mid' | 'high' | 'rare' | 'legend' | 'epic';

export const ITEM_GRADE_VALUES: ItemGrade[] = ['low', 'mid', 'high', 'rare', 'legend', 'epic'];

export const ITEM_GRADE_LABELS: Record<ItemGrade, string> = {
  low: '하급',
  mid: '중급',
  high: '상급',
  rare: '레어',
  legend: '레전드',
  epic: '에픽',
};

// 화면에 나타나지 않는 제어 문자로 감싸서, 자유 형식 텍스트 메시지 안에서도
// 클라이언트가 아이템 이름을 등급별 색상으로 구분해 렌더링할 수 있게 한다.
const MENTION_OPEN = String.fromCharCode(2);
const MENTION_SEP = String.fromCharCode(1);
const MENTION_CLOSE = String.fromCharCode(3);

export function formatItemMention(name: string, grade: ItemGrade): string {
  return `${MENTION_OPEN}${grade}${MENTION_SEP}${name}${MENTION_CLOSE}`;
}

export const ITEM_MENTION_PATTERN = new RegExp(
  `${MENTION_OPEN}([a-z]+)${MENTION_SEP}([^${MENTION_CLOSE}]*)${MENTION_CLOSE}`,
  'g',
);
