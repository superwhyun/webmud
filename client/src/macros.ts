export const MACRO_SLOTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
export type MacroSlot = (typeof MACRO_SLOTS)[number];
export type MacroMap = Record<MacroSlot, string>;

const STORAGE_KEY = 'mud-macros';

export function loadMacros(): MacroMap {
  const macros = Object.fromEntries(MACRO_SLOTS.map((slot) => [slot, ''])) as MacroMap;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return macros;
    const parsed = JSON.parse(raw) as Partial<MacroMap>;
    for (const slot of MACRO_SLOTS) {
      if (typeof parsed[slot] === 'string') macros[slot] = parsed[slot]!;
    }
  } catch {
    // 저장된 값이 손상된 경우 빈 매크로로 시작
  }
  return macros;
}

export function saveMacro(macros: MacroMap, slot: MacroSlot, text: string): MacroMap {
  const updated = { ...macros, [slot]: text };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
