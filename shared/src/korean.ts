/**
 * 몹/아이템 이름처럼 어떤 글자로 끝날지 미리 알 수 없는 동적 문자열 뒤에 조사를 붙일 때 쓴다.
 * 완성형 한글 음절(가~힣)만 받침 유무를 판정하고, 그 외(영문/숫자/기호 등으로 끝나는 이름)는
 * 받침 없음으로 취급한다.
 */
function hasBatchim(text: string): boolean {
  const lastChar = text.trim().at(-1);
  if (!lastChar) return false;
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

export function josaIGa(word: string): string {
  return hasBatchim(word) ? '이' : '가';
}

export function josaEulReul(word: string): string {
  return hasBatchim(word) ? '을' : '를';
}

export function josaEunNeun(word: string): string {
  return hasBatchim(word) ? '은' : '는';
}

export function josaGwaWa(word: string): string {
  return hasBatchim(word) ? '과' : '와';
}

/** word + 적절한 조사. 예: withJosa('고블린', josaIGa) -> '고블린이', withJosa('쥐', josaIGa) -> '쥐가'. */
export function withJosa(word: string, josaFn: (word: string) => string): string {
  return `${word}${josaFn(word)}`;
}
