import {
  type CharacterState,
  type CombatMobInfo,
  type ElementType,
  type EquipmentSlot,
  type EquipmentSnapshot,
  type InventoryItemInfo,
  type PassiveStat,
  type RoomSnapshot,
} from '@mud/shared';
import type { MacroMap } from '../../macros';

export interface ActiveCooldown {
  name: string;
  endsAt: number;
  totalMs: number;
}

export interface ActiveBuff {
  name: string;
  buffStat: PassiveStat;
  amount: number;
  endsAt: number;
  totalMs: number;
}

export interface TabCompletionState {
  base: string;
  candidates: string[];
  index: number;
}

/** 장비+인벤토리/능력치/스킬을 전환하는 캐릭터 시트의 탭. */
export type CharacterSheetTab = 'equip' | 'stats' | 'skill';

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
  buffPanel: HTMLDivElement;
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
  activeBuffs: Map<string, ActiveBuff>;
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
