import { SKILLS, type ClientMessage } from '@mud/shared';
import { MACRO_SLOTS, type MacroSlot } from '../../macros';
import { appendLine, type GameContext, type TabCompletionState } from './context';
import { CARDINAL_ALIASES } from './minimap';

const COMMAND_VERBS = [
  'look',
  'l',
  'help',
  'say',
  'shout',
  'who',
  'attack',
  'flee',
  'get',
  'drop',
  'inventory',
  'inv',
  'equip',
  'use',
  'village',
  'travel',
  'leave',
  'enter',
  'e',
  'raid',
  'stat',
  'skill',
  'cast',
  '마법',
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
  'up',
  'down',
  'u',
];

/** 게임 화면을 벗어났다 돌아올 때마다 새로 등록되는 걸 막기 위해, 이전에 등록한 핸들러를 기억해뒀다가 떼어낸다. */
let activeCommandFocusHandler: ((event: KeyboardEvent) => void) | null = null;

export function sendCommand(ctx: GameContext, text: string): void {
  const verb = text.trim().split(/\s+/)[0]?.toLowerCase();
  ctx.pendingDirection = verb ? (CARDINAL_ALIASES[verb] ?? null) : null;

  appendLine(ctx, `> ${text}`, 'echo');
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

  const tokens = value.split(' ');
  const tokenIndex = tokens.length - 1;
  const typed = tokens[tokenIndex];
  const base = tokenIndex === 0 ? '' : `${tokens.slice(0, tokenIndex).join(' ')} `;
  const verb = tokens[0].toLowerCase();
  const isCastVerb = verb === 'cast' || verb === '마법';

  let tabCompletion: TabCompletionState;
  if (ctx.tabCompletion && ctx.tabCompletion.base === base) {
    tabCompletion = ctx.tabCompletion;
    tabCompletion.index = (tabCompletion.index + 1) % tabCompletion.candidates.length;
  } else {
    let pool: string[];
    if (tokenIndex === 0) {
      pool = COMMAND_VERBS;
    } else if (isCastVerb && tokenIndex === 1) {
      pool = learnedSkillNameCandidates(ctx);
    } else if (isCastVerb) {
      pool = combatTargetCandidates(ctx);
    } else {
      pool = nameCompletionCandidates(ctx);
    }
    const lowerTyped = typed.toLowerCase();
    const candidates = pool.filter((candidate) => candidate.toLowerCase().startsWith(lowerTyped));
    if (candidates.length === 0) return;
    tabCompletion = { base, candidates, index: 0 };
    ctx.tabCompletion = tabCompletion;
  }

  ctx.commandInput.value = base + tabCompletion.candidates[tabCompletion.index];
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
    if ([ctx.equipModal, ctx.jobModal, ctx.skillModal, ctx.macroModal].some((modal) => !modal.hidden)) return true;
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
