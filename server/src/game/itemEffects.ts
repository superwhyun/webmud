export interface ItemBonusRow {
  strength_bonus: number;
  dexterity_bonus: number;
  attack_power_bonus: number;
  intelligence_bonus: number;
  physical_defense_bonus: number;
  magic_defense_bonus: number;
  heal_amount: number;
  mana_amount: number;
}

/** 0이 아닌 보너스만 골라 "힘 +2, 물리방어 +3" 같은 한 줄 요약을 만든다. examine과 shop 표에서 같이 쓴다. */
export function formatItemBonuses(item: ItemBonusRow): string {
  const bonuses: string[] = [];
  if (item.strength_bonus) bonuses.push(`힘 +${item.strength_bonus}`);
  if (item.dexterity_bonus) bonuses.push(`민첩 +${item.dexterity_bonus}`);
  if (item.attack_power_bonus) bonuses.push(`공격력 +${item.attack_power_bonus}`);
  if (item.intelligence_bonus) bonuses.push(`지능 +${item.intelligence_bonus}`);
  if (item.physical_defense_bonus) bonuses.push(`물리방어 +${item.physical_defense_bonus}`);
  if (item.magic_defense_bonus) bonuses.push(`마법방어 +${item.magic_defense_bonus}`);
  if (item.heal_amount) bonuses.push(`체력 회복 +${item.heal_amount}`);
  if (item.mana_amount) bonuses.push(`마나 회복 +${item.mana_amount}`);
  return bonuses.join(', ');
}

/** 한글/전각 문자는 라틴 문자의 2배 폭으로 그려지는 고정폭 폰트를 기준으로 한 화면 표시 폭. */
export function visualWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isWide =
      (code >= 0x1100 && code <= 0x115f) || // 한글 자모
      (code >= 0x2e80 && code <= 0xa4cf) || // CJK 부수/한자
      (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
      (code >= 0xf900 && code <= 0xfaff) || // CJK 호환 한자
      (code >= 0xff00 && code <= 0xff60) || // 전각 폼
      (code >= 0xffe0 && code <= 0xffe6);
    width += isWide ? 2 : 1;
  }
  return width;
}

/** 고정폭 폰트에서 열이 맞도록 문자를 오른쪽에 채워 넣는다. 이미 목표 폭을 넘으면 자르지 않고 그대로 둔다. */
export function padVisual(text: string, targetWidth: number): string {
  const gap = targetWidth - visualWidth(text);
  return gap > 0 ? text + ' '.repeat(gap) : text;
}
