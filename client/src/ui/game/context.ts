import {
  ITEM_MENTION_PATTERN,
  MAX_INVENTORY_SLOTS,
  type CharacterState,
  type CombatMobInfo,
  type EquipmentSlot,
  type EquipmentSnapshot,
  type ElementType,
  type InventoryItemInfo,
  type RoomSnapshot,
} from '@mud/shared';
import { loadMacros, type MacroMap } from '../../macros';
import { icon } from '../icons';

export interface ActiveCooldown {
  name: string;
  endsAt: number;
  totalMs: number;
}

export interface TabCompletionState {
  base: string;
  candidates: string[];
  index: number;
}

/** 장비+인벤토리(한 화면에 같이 보임)/스킬을 전환하는 캐릭터 시트의 탭. */
export type CharacterSheetTab = 'equip' | 'skill';

export interface GameContext {
  container: HTMLElement;
  token: string;
  isBuilder: boolean;
  isAdmin: boolean;
  onLogout: () => void;
  socket: WebSocket;

  roomHeader: HTMLDivElement;
  roomMeta: HTMLDivElement;
  roomVillage: HTMLDivElement;
  mobSpriteRow: HTMLDivElement;
  combatPanel: HTMLDivElement;
  terminal: HTMLDivElement;
  sidebarStats: HTMLDivElement;
  potionBar: HTMLDivElement;
  equipmentPanel: HTMLDivElement;
  cooldownPanel: HTMLDivElement;
  minimap: HTMLDivElement;
  inventoryCountLabel: HTMLSpanElement;
  commandInput: HTMLInputElement;
  characterSheetModal: HTMLDivElement;
  characterSheetTabs: HTMLDivElement;
  characterSheetBody: HTMLDivElement;
  characterSheetActiveTab: CharacterSheetTab;
  /** 스킬 창에서 현재 보고 있는 오행 페이지. 창을 새로 열 때는 캐릭터 오행으로 초기화한다. */
  activeSkillElement: ElementType | null;
  /** 방금 장착/해제한 슬롯 — 다음 렌더에서 이 슬롯 카드에 한 번만 flash를 재생하고 지운다. */
  lastEquipFlashSlot: EquipmentSlot | null;
  /** 방금 배우거나 강화한 스킬 id — 다음 렌더에서 이 노드에 한 번만 unlock-pulse를 재생하고 지운다. */
  lastSkillUnlockId: string | null;
  jobModal: HTMLDivElement;
  jobModalBody: HTMLDivElement;
  macroModal: HTMLDivElement;
  macroModalBody: HTMLDivElement;
  suggestionModal: HTMLDivElement;
  suggestionModalBody: HTMLDivElement;

  currentCharacterState: CharacterState | undefined;
  learnedSkillIds: string[];
  learnedSkillRanks: Record<string, number>;
  latestCombatMobs: CombatMobInfo[];
  activeCooldowns: Map<string, ActiveCooldown>;
  macros: MacroMap;
  equipmentState: EquipmentSnapshot;
  inventoryState: InventoryItemInfo[];

  /** 방 id -> 로컬 좌표. 존이 바뀌거나 방향 없는 순간이동(부활 등)으로 미지의 방에 도착하면 새 원점에서 다시 시작한다. */
  roomCoord: Map<number, { zoneId: number; x: number; y: number }>;
  coordRoom: Map<string, number>;
  roomNames: Map<number, string>;
  /** 새 원점을 잡을 때마다 하나씩 늘려서, 같은 존 안에서 이미 쓰인 좌표와 절대 겹치지 않는 새 원점을 고른다. */
  nextLocalOrigin: number;
  /** 마지막으로 확인한 출구 정보를 방 id별로 기억해서, 그 방을 떠난 뒤에도 미니맵에 계속 표시한다. */
  roomExits: Map<number, RoomSnapshot['exits']>;
  currentRoomId: number | null;
  pendingDirection: 'north' | 'south' | 'east' | 'west' | null;
  latestRoom: RoomSnapshot | null;
  /** 가장 최근에 죽었던 방 id — 미니맵에 빨간 X로 표시한다. */
  lastDeathRoomId: number | null;

  commandHistory: string[];
  historyIndex: number;
  historyDraft: string;
  tabCompletion: TabCompletionState | null;
}

function renderShellHtml(isBuilder: boolean, isAdmin: boolean): string {
  return `
    <div class="room-panel" id="room-panel">
      <div class="room-header" id="room-header"></div>
      <div class="room-lower-row">
        <aside class="room-map-dock">
          <div class="room-map-title">지도</div>
          <div class="minimap" id="minimap"></div>
        </aside>
        <div class="room-meta" id="room-meta"></div>
      </div>
      <div id="room-village"></div>
    </div>
    <div class="mob-sprite-row" id="mob-sprite-row"></div>
    <div class="command-input">
      <span class="prompt">&gt;</span>
      <input id="command" type="text" autocomplete="off" autofocus aria-label="명령어 입력" />
    </div>
    <div class="potion-bar" id="potion-bar"></div>
    <div class="combat-panel" id="combat-panel" hidden></div>
    <div class="game-layout">
      <div class="terminal" id="terminal"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-stats" id="sidebar-stats"></div>
        <div class="equipment-panel" id="equipment-panel"></div>
        <div class="cooldown-panel" id="cooldown-panel"></div>
      </aside>
      <aside class="inventory-panel" id="inventory-panel">
        <div class="ops-menu-section">
          <div class="ops-menu-title">사용자 메뉴</div>
          <button type="button" id="inventory-button" class="inventory-open-btn">인벤토리 (<span id="inventory-count">0</span>/${MAX_INVENTORY_SLOTS})</button>
          <button type="button" id="equip-swap-button" class="equip-swap-btn">장비 교체</button>
          <button type="button" id="skill-button" class="skill-btn">스킬</button>
          <button type="button" id="macro-button" class="skill-btn">매크로</button>
          <button type="button" id="suggestion-button" class="skill-btn">개선 제안</button>
          <button type="button" id="logout-button" class="logout-btn">로그아웃</button>
        </div>
        ${
          isBuilder
            ? `<div class="ops-menu-section">
                <div class="ops-menu-title">${icon('wrench')} 빌더 메뉴</div>
                <button type="button" id="builder-entry" class="builder-entry-btn">맵 편집기 열기</button>
              </div>`
            : ''
        }
        ${
          isAdmin
            ? `<div class="ops-menu-section">
                <div class="ops-menu-title">${icon('gear')} 어드민 메뉴</div>
                <button type="button" id="admin-entry" class="admin-entry-btn">관리자 패널 열기</button>
              </div>`
            : ''
        }
      </aside>
    </div>
    <div class="modal-overlay" id="character-sheet-modal" hidden>
      <div class="modal-content modal-content-xl character-sheet">
        <div class="modal-header character-sheet-header">
          <div class="character-sheet-tabs" id="character-sheet-tabs"></div>
          <button type="button" id="character-sheet-close" class="modal-close-btn" aria-label="닫기">✕</button>
        </div>
        <div class="modal-body" id="character-sheet-body"></div>
      </div>
    </div>
    <div class="modal-overlay" id="job-modal" hidden>
      <div class="modal-content">
        <div class="modal-header">
          <span>직업 선택</span>
        </div>
        <div class="modal-body" id="job-modal-body"></div>
      </div>
    </div>
    <div class="modal-overlay" id="macro-modal" hidden>
      <div class="modal-content">
        <div class="modal-header">
          <span>매크로</span>
          <button type="button" id="macro-modal-close" class="modal-close-btn" aria-label="닫기">✕</button>
        </div>
        <div class="modal-body" id="macro-modal-body"></div>
      </div>
    </div>
    <div class="modal-overlay" id="suggestion-modal" hidden>
      <div class="modal-content modal-content-lg">
        <div class="modal-header">
          <span>개선 제안</span>
          <button type="button" id="suggestion-modal-close" class="modal-close-btn" aria-label="닫기">✕</button>
        </div>
        <div class="modal-body" id="suggestion-modal-body"></div>
      </div>
    </div>
  `;
}

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

function appendItemMentions(target: HTMLElement, text: string): void {
  ITEM_MENTION_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ITEM_MENTION_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      target.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const [, grade, name] = match;
    const span = document.createElement('span');
    span.className = `item-grade-${grade}`;
    span.textContent = name;
    target.appendChild(span);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    target.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

const MAX_LOG_LINES = 500;
const persistedLog: { text: string; channel?: string }[] = [];

function renderLine(terminal: HTMLDivElement, text: string, channel?: string): void {
  const line = document.createElement('div');
  line.className = `line line-${channel ?? 'system'}`;
  appendItemMentions(line, text);
  terminal.prepend(line);
  terminal.scrollTop = 0;
}

export function appendLine(ctx: GameContext, text: string, channel?: string): void {
  persistedLog.push({ text, channel });
  if (persistedLog.length > MAX_LOG_LINES) persistedLog.shift();
  renderLine(ctx.terminal, text, channel);
}
