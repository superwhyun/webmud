import { loadMacros } from '../../macros';
import { renderShellHtml } from './shell';
import { persistedLog, renderLine } from './log';
import type { GameContext } from './types';

export type { ActiveCooldown, ActiveBuff, TabCompletionState, CharacterSheetTab, GameContext } from './types';
export { appendLine } from './log';

export function createGameContext(
  container: HTMLElement,
  token: string,
  isBuilder: boolean,
  isAdmin: boolean,
  onLogout: () => void,
  previous: GameContext | null,
): GameContext {
  container.innerHTML = renderShellHtml(isBuilder, isAdmin);

  const socket = previous?.socket ?? new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);

  const terminal = container.querySelector<HTMLDivElement>('#terminal')!;
  for (const entry of persistedLog) {
    renderLine(terminal, entry.text, entry.channel);
  }

  return {
    container,
    token,
    isBuilder,
    isAdmin,
    onLogout,
    socket,

    roomHeader: container.querySelector<HTMLDivElement>('#room-header')!,
    roomMeta: container.querySelector<HTMLDivElement>('#room-meta')!,
    roomVillage: container.querySelector<HTMLDivElement>('#room-village')!,
    mobSpriteRow: container.querySelector<HTMLDivElement>('#mob-sprite-row')!,
    combatPanel: container.querySelector<HTMLDivElement>('#combat-panel')!,
    terminal,
    sidebarStats: container.querySelector<HTMLDivElement>('#sidebar-stats')!,
    potionBar: container.querySelector<HTMLDivElement>('#potion-bar')!,
    equipmentPanel: container.querySelector<HTMLDivElement>('#equipment-panel')!,
    cooldownPanel: container.querySelector<HTMLDivElement>('#cooldown-panel')!,
    buffPanel: container.querySelector<HTMLDivElement>('#buff-panel')!,
    minimap: container.querySelector<HTMLDivElement>('#minimap')!,
    inventoryCountLabel: container.querySelector<HTMLSpanElement>('#inventory-count')!,
    commandInput: container.querySelector<HTMLInputElement>('#command')!,
    characterSheetModal: container.querySelector<HTMLDivElement>('#character-sheet-modal')!,
    characterSheetTabs: container.querySelector<HTMLDivElement>('#character-sheet-tabs')!,
    characterSheetBody: container.querySelector<HTMLDivElement>('#character-sheet-body')!,
    characterSheetActiveTab: previous?.characterSheetActiveTab ?? 'equip',
    activeSkillElement: previous?.activeSkillElement ?? null,
    lastEquipFlashSlot: null,
    lastSkillUnlockId: null,
    jobModal: container.querySelector<HTMLDivElement>('#job-modal')!,
    jobModalBody: container.querySelector<HTMLDivElement>('#job-modal-body')!,
    macroModal: container.querySelector<HTMLDivElement>('#macro-modal')!,
    macroModalBody: container.querySelector<HTMLDivElement>('#macro-modal-body')!,
    suggestionModal: container.querySelector<HTMLDivElement>('#suggestion-modal')!,
    suggestionModalBody: container.querySelector<HTMLDivElement>('#suggestion-modal-body')!,

    currentCharacterState: previous?.currentCharacterState,
    learnedSkillIds: previous?.learnedSkillIds ?? [],
    learnedSkillRanks: previous?.learnedSkillRanks ?? {},
    latestCombatMobs: previous?.latestCombatMobs ?? [],
    activeCooldowns: previous?.activeCooldowns ?? new Map(),
    activeBuffs: previous?.activeBuffs ?? new Map(),
    macros: loadMacros(),
    equipmentState: previous?.equipmentState ?? {},
    inventoryState: previous?.inventoryState ?? [],

    roomCoord: previous?.roomCoord ?? new Map(),
    coordRoom: previous?.coordRoom ?? new Map(),
    roomNames: previous?.roomNames ?? new Map(),
    nextLocalOrigin: previous?.nextLocalOrigin ?? 0,
    roomExits: previous?.roomExits ?? new Map(),
    currentRoomId: previous?.currentRoomId ?? null,
    pendingDirection: null,
    latestRoom: previous?.latestRoom ?? null,
    lastDeathRoomId: previous?.lastDeathRoomId ?? null,

    commandHistory: previous?.commandHistory ?? [],
    historyIndex: 0,
    historyDraft: '',
    tabCompletion: null,
  };
}

export function hpLevel(ratio: number): 'normal' | 'warning' | 'danger' {
  if (ratio <= 0.25) return 'danger';
  if (ratio <= 0.5) return 'warning';
  return 'normal';
}
