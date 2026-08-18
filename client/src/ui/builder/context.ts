import type {
  BuilderRoomDto,
  ItemTemplateDto,
  MapAssistantOperation,
  MobSpawnDto,
  MobTemplateDto,
  NpcSpawnDto,
  NpcTemplateDto,
  RoomItemDto,
  RoomOptionAllZonesDto,
  ZoneDto,
} from '../../builderApi';
import type { ItemGrade, NpcType } from '@mud/shared';

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

export const CARDINAL_OFFSET: Record<CardinalDirection, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};
export const CARDINAL_DIRECTIONS = Object.keys(CARDINAL_OFFSET) as CardinalDirection[];
export const CARDINAL_SET = new Set<string>(CARDINAL_DIRECTIONS);

export interface Point {
  x: number;
  y: number;
}

export interface EdgeEntry {
  fromId: number;
  toId: number;
  direction: string;
  blocked: boolean;
}

export interface DragState {
  roomId: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

export interface BuilderContext {
  container: HTMLElement;
  token: string;
  onBack: () => void;

  svg: SVGSVGElement;
  panel: HTMLDivElement;
  palette: HTMLDivElement;
  zoneBar: HTMLDivElement;
  addRoomButton: HTMLButtonElement;
  backButton: HTMLButtonElement;
  toolbarError: HTMLSpanElement;
  exportButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  importFileInput: HTMLInputElement;

  assistantPromptInput: HTMLTextAreaElement;
  assistantProposeButton: HTMLButtonElement;
  assistantResults: HTMLDivElement;
  assistantOperations: MapAssistantOperation[];
  assistantSelected: boolean[];
  assistantSummary: string;
  assistantLoading: boolean;

  rooms: BuilderRoomDto[];
  selectedRoomId: number | null;
  panelMode: 'create' | 'edit' | 'empty';

  zones: ZoneDto[];
  selectedZoneId: number | null;
  allRoomOptions: RoomOptionAllZonesDto[];

  itemTemplates: ItemTemplateDto[];
  mobTemplates: MobTemplateDto[];
  roomItems: RoomItemDto[];
  mobSpawns: MobSpawnDto[];
  npcTemplates: NpcTemplateDto[];
  npcSpawns: NpcSpawnDto[];
  expandedItemGrades: Set<ItemGrade>;
  /** 몹 레벨 구간(브라켓의 하한값, 예: 1/6/11/...)별 펼침 상태. */
  expandedMobLevelBrackets: Set<number>;
  expandedNpcTypes: Set<NpcType>;

  livePositions: Map<number, Point>;
  nodeElements: Map<number, SVGGElement>;
  dragState: DragState | null;

  /** rooms를 다시 불러와 캔버스/패널/팔레트를 함께 다시 그린다. 각 모듈이 서로를 직접 import하면 순환 참조가 생기므로, 조립은 builderScreen.ts가 하고 여기엔 콜백만 심어둔다. */
  refresh: () => Promise<void>;
  /** 서버 재조회 없이, 이미 메모리에 있는 상태로만 캔버스/패널/팔레트를 다시 그린다(선택 변경 등 즉각 반응이 필요한 경우). */
  rerenderAll: () => void;
}

function renderShellHtml(): string {
  return `
    <div class="builder-screen">
      <div class="builder-toolbar">
        <span class="builder-title">빌더</span>
        <button type="button" id="builder-add-room">+ 방 추가</button>
        <button type="button" id="builder-export" title="계정/캐릭터를 제외한 존/방/스폰/템플릿을 JSON으로 내려받습니다.">맵 내보내기</button>
        <button type="button" id="builder-import" title="JSON 파일로 콘텐츠 데이터 전체를 교체합니다. (어드민 권한 필요)">맵 가져오기</button>
        <input type="file" id="builder-import-file" accept="application/json" hidden />
        <span class="builder-toolbar-error" id="builder-toolbar-error"></span>
        <button type="button" id="builder-back">게임으로 돌아가기</button>
      </div>
      <div class="builder-assistant" id="builder-assistant">
        <textarea
          id="builder-assistant-prompt"
          class="builder-assistant-prompt"
          rows="2"
          placeholder="AI에게 맵 수정을 요청하세요. 예: 북쪽에 방 2개 추가하고 각 방에 몹 하나씩 배치해줘"
        ></textarea>
        <button type="button" id="builder-assistant-propose">AI로 제안받기</button>
        <div class="builder-assistant-results" id="builder-assistant-results"></div>
      </div>
      <div class="builder-zone-bar" id="builder-zone-bar"></div>
      <div class="builder-body">
        <div class="builder-canvas-wrap" id="builder-canvas-wrap">
          <svg class="builder-canvas" id="builder-canvas"></svg>
        </div>
        <aside class="builder-panel" id="builder-panel">
          <p class="builder-panel-empty">방을 선택하세요.</p>
        </aside>
        <aside class="builder-palette" id="builder-palette"></aside>
      </div>
    </div>
  `;
}

export function createBuilderContext(container: HTMLElement, token: string, onBack: () => void): BuilderContext {
  container.innerHTML = renderShellHtml();

  return {
    container,
    token,
    onBack,

    svg: container.querySelector<SVGSVGElement>('#builder-canvas')!,
    panel: container.querySelector<HTMLDivElement>('#builder-panel')!,
    palette: container.querySelector<HTMLDivElement>('#builder-palette')!,
    zoneBar: container.querySelector<HTMLDivElement>('#builder-zone-bar')!,
    addRoomButton: container.querySelector<HTMLButtonElement>('#builder-add-room')!,
    backButton: container.querySelector<HTMLButtonElement>('#builder-back')!,
    toolbarError: container.querySelector<HTMLSpanElement>('#builder-toolbar-error')!,
    exportButton: container.querySelector<HTMLButtonElement>('#builder-export')!,
    importButton: container.querySelector<HTMLButtonElement>('#builder-import')!,
    importFileInput: container.querySelector<HTMLInputElement>('#builder-import-file')!,

    assistantPromptInput: container.querySelector<HTMLTextAreaElement>('#builder-assistant-prompt')!,
    assistantProposeButton: container.querySelector<HTMLButtonElement>('#builder-assistant-propose')!,
    assistantResults: container.querySelector<HTMLDivElement>('#builder-assistant-results')!,
    assistantOperations: [],
    assistantSelected: [],
    assistantSummary: '',
    assistantLoading: false,

    rooms: [],
    selectedRoomId: null,
    panelMode: 'empty',

    zones: [],
    selectedZoneId: null,
    allRoomOptions: [],

    itemTemplates: [],
    mobTemplates: [],
    roomItems: [],
    mobSpawns: [],
    npcTemplates: [],
    npcSpawns: [],
    expandedItemGrades: new Set(),
    expandedMobLevelBrackets: new Set(),
    expandedNpcTypes: new Set(),

    livePositions: new Map(),
    nodeElements: new Map(),
    dragState: null,

    refresh: async () => {},
    rerenderAll: () => {},
  };
}

export function findRoom(ctx: BuilderContext, id: number): BuilderRoomDto | undefined {
  return ctx.rooms.find((room) => room.id === id);
}

export function cellOccupant(ctx: BuilderContext, x: number, y: number, excludeId?: number): BuilderRoomDto | undefined {
  return ctx.rooms.find((room) => room.id !== excludeId && room.x === x && room.y === y);
}

export function availableDirectionsFrom(ctx: BuilderContext, room: BuilderRoomDto): CardinalDirection[] {
  return CARDINAL_DIRECTIONS.filter((direction) => {
    const offset = CARDINAL_OFFSET[direction];
    return !cellOccupant(ctx, room.x + offset.dx, room.y + offset.dy);
  });
}

export function computeFreeCell(ctx: BuilderContext): Point {
  if (ctx.rooms.length === 0) return { x: 0, y: 0 };
  const maxY = Math.max(...ctx.rooms.map((room) => room.y));
  const targetY = maxY + 2;
  let x = 0;
  while (cellOccupant(ctx, x, targetY)) x += 1;
  return { x, y: targetY };
}

export function showToolbarError(ctx: BuilderContext, message: string): void {
  ctx.toolbarError.textContent = message;
  setTimeout(() => {
    if (ctx.toolbarError.textContent === message) ctx.toolbarError.textContent = '';
  }, 3000);
}
