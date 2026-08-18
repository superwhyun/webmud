import { DIRECTION_LABELS, DIRECTION_VALUES, SKILLS, type ClientMessage } from '@mud/shared';
import { MACRO_SLOTS, type MacroSlot } from '../../macros';
import { appendLine, type GameContext, type TabCompletionState } from './context';
import { CARDINAL_ALIASES } from './minimap';

const COMMAND_VERBS = [
  'look',
  'l',
  'help',
  'say',
  'shout',
  'tell',
  'who',
  'attack',
  'flee',
  'rest',
  '휴식',
  'get',
  'drop',
  'give',
  'examine',
  'ex',
  'consider',
  'con',
  'inventory',
  'inv',
  'equip',
  'use',
  'village',
  'travel',
  'leave',
  'enter',
  'e',
  '입장',
  'raid',
  'stat',
  'skill',
  'cast',
  '마법',
  '공격',
  'shop',
  'buy',
  'sell',
  'north',
  'south',
  'east',
  'west',
  'w',
  'a',
  's',
  'd',
  'ㅈ',
  'ㅁ',
  'ㄴ',
  'ㅇ',
  'up',
  'down',
  'u',
];

const HANGUL_INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 완성된 한글 음절 한 글자의 초성만 뽑아낸다 (한글 음절이 아니면 null). */
function koreanInitialOf(char: string): string | null {
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return HANGUL_INITIALS[Math.floor((code - 0xac00) / (21 * 28))];
}

/**
 * 한영전환 없이 자음만(예: "ㄱ") 입력했을 때도, 그 자음이 초성인 후보(예: "공격")를 찾을 수 있게 한다.
 * 완성된 글자로 입력했을 때는(예: "공") 기존처럼 접두어 일치로 충분하다.
 */
function matchesTyped(candidate: string, typed: string): boolean {
  if (candidate.toLowerCase().startsWith(typed.toLowerCase())) return true;
  return typed.length === 1 && HANGUL_INITIALS.includes(typed) && koreanInitialOf(candidate[0]) === typed;
}

/** 게임 화면을 벗어났다 돌아올 때마다 새로 등록되는 걸 막기 위해, 이전에 등록한 핸들러를 기억해뒀다가 떼어낸다. */
let activeCommandFocusHandler: ((event: KeyboardEvent) => void) | null = null;

export function sendCommand(ctx: GameContext, text: string): void {
  const verb = text.trim().split(/\s+/)[0]?.toLowerCase();
  const direction = verb ? (CARDINAL_ALIASES[verb] ?? null) : null;
  ctx.pendingDirection = direction;

  appendLine(ctx, direction ? `> ${DIRECTION_LABELS[direction]}으로 이동` : `> ${text}`, 'echo');
  const message: ClientMessage = { type: 'command', text };
  ctx.socket.send(JSON.stringify(message));
  ctx.commandInput.value = '';
  ctx.tabCompletion = null;

  if (ctx.commandHistory[ctx.commandHistory.length - 1] !== text) {
    ctx.commandHistory.push(text);
  }
  ctx.historyIndex = ctx.commandHistory.length;
}

function navigateHistory(ctx: GameContext, direction: -1 | 1): void {
  if (ctx.commandHistory.length === 0) return;

  if (direction === -1) {
    if (ctx.historyIndex === 0) return;
    if (ctx.historyIndex === ctx.commandHistory.length) ctx.historyDraft = ctx.commandInput.value;
    ctx.historyIndex -= 1;
  } else {
    if (ctx.historyIndex === ctx.commandHistory.length) return;
    ctx.historyIndex += 1;
  }

  ctx.commandInput.value = ctx.historyIndex === ctx.commandHistory.length ? ctx.historyDraft : ctx.commandHistory[ctx.historyIndex];
  ctx.commandInput.setSelectionRange(ctx.commandInput.value.length, ctx.commandInput.value.length);
}

function nameCompletionCandidates(ctx: GameContext): string[] {
  const names = new Set<string>();
  if (ctx.latestRoom) {
    for (const mob of ctx.latestRoom.mobs) names.add(mob.name);
    for (const item of ctx.latestRoom.items) names.add(item.name);
  }
  for (const item of ctx.inventoryState) names.add(item.name);
  return [...names];
}

/** get은 몹이나 인벤토리가 아니라 방 바닥의 아이템만 대상이 될 수 있으므로, 방 아이템 목록 순서 그대로 후보를 만든다. */
function roomItemCandidates(ctx: GameContext): string[] {
  const names = new Set<string>();
  if (ctx.latestRoom) {
    for (const item of ctx.latestRoom.items) names.add(item.name);
  }
  return [...names];
}

/** enter는 방향이 아닌 이름 붙은 연결점(포털)만 대상이 될 수 있으므로, north/south/east/west/up/down이 아닌 출구만 후보로 삼는다. 한 방에 포털이 여러 개일 수 있다. */
function portalExitCandidates(ctx: GameContext): string[] {
  const names = new Set<string>();
  if (ctx.latestRoom) {
    for (const exit of ctx.latestRoom.exits) {
      if (!DIRECTION_VALUES.includes(exit.direction)) names.add(exit.direction);
    }
  }
  return [...names];
}

/** use는 체력/마나를 회복하는 소모품만 대상이 될 수 있으므로, 인벤토리 중 사용 가능한 아이템만 후보로 삼는다. */
function usableItemCandidates(ctx: GameContext): string[] {
  const names = new Set<string>();
  for (const item of ctx.inventoryState) {
    if (item.healAmount > 0 || item.manaAmount > 0) names.add(item.name);
  }
  return [...names];
}

/** give는 인벤토리에 있는 아이템만 건네줄 수 있으므로, 인벤토리 이름 전체를 후보로 삼는다. */
function inventoryItemCandidates(ctx: GameContext): string[] {
  return [...new Set(ctx.inventoryState.map((item) => item.name))];
}

/** give의 두 번째 인자(대상)는 같은 방에 있는 다른 플레이어만 될 수 있으므로, 방의 유저 목록에서 자신을 뺀 이름을 후보로 삼는다. */
function roomPlayerCandidates(ctx: GameContext): string[] {
  const selfName = ctx.currentCharacterState?.name;
  return ctx.latestRoom?.players.filter((name) => name !== selfName) ?? [];
}

/** examine/consider는 방의 몹/NPC/아이템, 그리고 examine은 인벤토리 아이템까지 대상이 될 수 있다. */
function examineCandidates(ctx: GameContext): string[] {
  const names = new Set<string>();
  if (ctx.latestRoom) {
    for (const mob of ctx.latestRoom.mobs) names.add(mob.name);
    for (const npc of ctx.latestRoom.npcs) names.add(npc.name);
    for (const item of ctx.latestRoom.items) names.add(item.name);
  }
  for (const item of ctx.inventoryState) names.add(item.name);
  return [...names];
}

/** consider는 방에 있는 몬스터만 대상이 될 수 있다. */
function considerCandidates(ctx: GameContext): string[] {
  return ctx.latestRoom ? [...new Set(ctx.latestRoom.mobs.map((mob) => mob.name))] : [];
}

/** buy는 방에 있는 상인들이 파는 품목만 대상이 될 수 있으므로, 상인별 판매 목록을 모아 후보로 삼는다. */
function shopItemCandidates(ctx: GameContext): string[] {
  const names = new Set<string>();
  if (ctx.latestRoom) {
    for (const npc of ctx.latestRoom.npcs) {
      for (const itemName of npc.shopItemNames) names.add(itemName);
    }
  }
  return [...names];
}

function learnedSkillNameCandidates(ctx: GameContext): string[] {
  const names = new Set<string>();
  for (const skill of SKILLS) {
    if (ctx.learnedSkillIds.includes(skill.id)) names.add(skill.name);
  }
  return [...names];
}

function combatTargetCandidates(ctx: GameContext): string[] {
  return ctx.latestCombatMobs.length > 0
    ? [...new Set(ctx.latestCombatMobs.map((mob) => mob.name))]
    : nameCompletionCandidates(ctx);
}

/**
 * 두 번째 탭부터는 새로 후보를 계산하지 않고 이전 후보 목록을 순환한다.
 * 동일 접두사에 여러 후보(예: "가죽"으로 시작하는 아이템 여러 개)가 있을 때
 * 탭을 반복해서 눌러 하나씩 넘겨보게 하기 위함이다.
 *
 * 이전에 채워 넣은 후보 자체에 공백이 들어있으면(예: "용의 발톱") 입력값을 다시
 * 공백으로 토큰화했을 때 base가 달라져 버리므로, "이전 base + 이전에 선택된 후보"와
 * 현재 입력값이 그대로 일치하는지로 순환 중인지를 판단한다.
 *
 * "마법"/"cast"는 두 번째 토큰이 스킬 이름, 세 번째 토큰이 대상이라서
 * 토큰 위치에 따라 후보 풀이 달라진다. 그 외 명령어는 기존처럼
 * 첫 토큰이면 명령어 목록, 아니면 방/인벤토리 이름 목록을 쓴다.
 */
function handleTabComplete(ctx: GameContext): void {
  const value = ctx.commandInput.value;

  if (MACRO_SLOTS.includes(value as MacroSlot) && ctx.macros[value as MacroSlot]) {
    ctx.commandInput.value = ctx.macros[value as MacroSlot];
    ctx.commandInput.setSelectionRange(ctx.commandInput.value.length, ctx.commandInput.value.length);
    ctx.tabCompletion = null;
    return;
  }

  const previous = ctx.tabCompletion;
  const isContinuingCycle = previous !== null && value === previous.base + previous.candidates[previous.index];

  let tabCompletion: TabCompletionState;
  if (isContinuingCycle) {
    tabCompletion = previous!;
    tabCompletion.index = (tabCompletion.index + 1) % tabCompletion.candidates.length;
  } else {
    const tokens = value.split(' ');
    const tokenIndex = tokens.length - 1;
    const typed = tokens[tokenIndex];
    const base = tokenIndex === 0 ? '' : `${tokens.slice(0, tokenIndex).join(' ')} `;
    const verb = tokens[0].toLowerCase();
    const isCastVerb = verb === 'cast' || verb === '마법';

    let pool: string[];
    if (tokenIndex === 0) {
      pool = COMMAND_VERBS;
    } else if (isCastVerb && tokenIndex === 1) {
      pool = learnedSkillNameCandidates(ctx);
    } else if (isCastVerb) {
      pool = combatTargetCandidates(ctx);
    } else if (verb === 'get') {
      pool = roomItemCandidates(ctx);
    } else if (verb === 'enter' || verb === 'e' || verb === '입장') {
      pool = portalExitCandidates(ctx);
    } else if (verb === 'use') {
      pool = usableItemCandidates(ctx);
    } else if (verb === 'buy') {
      pool = shopItemCandidates(ctx);
    } else if (verb === 'give') {
      pool = tokenIndex === 1 ? inventoryItemCandidates(ctx) : roomPlayerCandidates(ctx);
    } else if (verb === 'examine' || verb === 'ex') {
      pool = examineCandidates(ctx);
    } else if (verb === 'consider' || verb === 'con') {
      pool = considerCandidates(ctx);
    } else {
      pool = nameCompletionCandidates(ctx);
    }
    const candidates = pool.filter((candidate) => matchesTyped(candidate, typed));
    if (candidates.length === 0) return;
    tabCompletion = { base, candidates, index: 0 };
    ctx.tabCompletion = tabCompletion;
  }

  ctx.commandInput.value = tabCompletion.base + tabCompletion.candidates[tabCompletion.index];
  ctx.commandInput.setSelectionRange(ctx.commandInput.value.length, ctx.commandInput.value.length);
}

export function attachCommandBarListeners(ctx: GameContext): void {
  ctx.commandInput.addEventListener('input', () => {
    ctx.tabCompletion = null;
  });

  ctx.commandInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.isComposing) return;

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      navigateHistory(ctx, -1);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      navigateHistory(ctx, 1);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      handleTabComplete(ctx);
      return;
    }

    if (event.key !== 'Enter') return;
    const text = ctx.commandInput.value.trim();
    if (!text) return;
    sendCommand(ctx, text);
  });

  if (activeCommandFocusHandler) {
    document.removeEventListener('keydown', activeCommandFocusHandler);
  }

  /** 모달이 열려있거나 다른 입력/버튼에 포커스가 있는 게 아니라면, 키보드 입력이 항상 명령창으로 가도록 되돌려놓는다. */
  function isFocusStealExempt(): boolean {
    if ([ctx.characterSheetModal, ctx.jobModal, ctx.macroModal].some((modal) => !modal.hidden)) return true;
    const active = document.activeElement;
    if (!active || active === ctx.commandInput) return false;
    const tag = active.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (active as HTMLElement).isContentEditable;
  }

  activeCommandFocusHandler = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isFocusStealExempt()) return;
    ctx.commandInput.focus();
  };
  document.addEventListener('keydown', activeCommandFocusHandler);
}
