import { DIRECTION_VALUES, type RoomSnapshot } from '@mud/shared';
import type { GameContext } from './context';

// WASD 배치: w=북, a=서, s=남, d=동. e는 enter(포털) 단축 verb라 방향에 없음.
/** 한영전환 없이 두벌식 자판으로 wasd를 누르면 나오는 자모(ㅈ/ㅁ/ㄴ/ㅇ)도 서버와 동일하게 받아준다. */
export const CARDINAL_ALIASES: Record<string, 'north' | 'south' | 'east' | 'west'> = {
  north: 'north',
  w: 'north',
  ㅈ: 'north',
  south: 'south',
  s: 'south',
  ㄴ: 'south',
  east: 'east',
  d: 'east',
  ㅇ: 'east',
  west: 'west',
  a: 'west',
  ㅁ: 'west',
};

const CARDINAL_OFFSET: Record<'north' | 'south' | 'east' | 'west', { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

const MINIMAP_COL_RADIUS = 1; // 3 columns wide
const MINIMAP_ROW_START = -1;
const MINIMAP_ROW_END = 1; // 3 rows tall

const MINIMAP_EXIT_GLYPH: Record<'north' | 'south' | 'east' | 'west', string> = {
  north: '▲',
  south: '▼',
  east: '▶',
  west: '◀',
};
const MINIMAP_CARDINAL_DIRECTIONS = new Set(['north', 'south', 'east', 'west']);
/** north/south/east/west/up/down이 아닌 출구는 빌더가 만든 이름 붙은 연결점(enter로 타는 포털)이다. */
const MINIMAP_SPATIAL_DIRECTIONS = new Set(DIRECTION_VALUES);

/** 같은 존 안에서 새 원점끼리 절대 겹치지 않도록, 원점을 잡을 때마다 충분히 먼 y로 밀어낸다. */
const LOCAL_ORIGIN_GAP = 1000;

function setRoomPosition(ctx: GameContext, roomId: number, zoneId: number, x: number, y: number): void {
  ctx.roomCoord.set(roomId, { zoneId, x, y });
  ctx.coordRoom.set(`${zoneId}:${x},${y}`, roomId);
}

/** 방향 없는 순간이동(부활, 포털, 관리자 이동 등)으로 미지의 방에 도착했을 때 쓸, 기존 좌표와 겹치지 않는 새 원점. */
function nextLocalOrigin(ctx: GameContext): { x: number; y: number } {
  const y = ctx.nextLocalOrigin * LOCAL_ORIGIN_GAP;
  ctx.nextLocalOrigin += 1;
  return { x: 0, y };
}

export function recordRoomVisit(ctx: GameContext, room: RoomSnapshot): void {
  ctx.roomNames.set(room.id, room.name);
  ctx.roomExits.set(room.id, room.exits);

  if (!ctx.roomCoord.has(room.id)) {
    const previous = ctx.currentRoomId !== null ? ctx.roomCoord.get(ctx.currentRoomId) : undefined;
    if (previous && ctx.pendingDirection && previous.zoneId === room.zoneId) {
      const offset = CARDINAL_OFFSET[ctx.pendingDirection];
      setRoomPosition(ctx, room.id, room.zoneId, previous.x + offset.dx, previous.y + offset.dy);
    } else {
      // 최초 진입이거나(전 위치 없음) 존이 바뀐 이동(부활/포털 등 인접성 없는 이동) → 기존 좌표와 겹치지 않는 새 원점에서 시작
      const origin = nextLocalOrigin(ctx);
      setRoomPosition(ctx, room.id, room.zoneId, origin.x, origin.y);
    }
  }

  ctx.currentRoomId = room.id;
  ctx.pendingDirection = null;
}

/** 방 칸 위에 출구 방향(화살표)/막힘(X)/포털(P) 표시를 얹는다. 가본 적 있는 방이면 그 방을 떠난 뒤에도 마지막으로 확인한 출구 정보를 계속 보여준다. */
function renderMinimapExits(cell: HTMLSpanElement, exits: RoomSnapshot['exits']): void {
  let hasPortal = false;
  for (const exit of exits) {
    if (MINIMAP_CARDINAL_DIRECTIONS.has(exit.direction)) {
      const direction = exit.direction as 'north' | 'south' | 'east' | 'west';
      const marker = document.createElement('span');
      marker.className = `minimap-exit minimap-exit-${direction}${exit.blocked ? ' minimap-exit-blocked' : ''}`;
      marker.textContent = exit.blocked ? '✕' : MINIMAP_EXIT_GLYPH[direction];
      cell.appendChild(marker);
    } else if (!MINIMAP_SPATIAL_DIRECTIONS.has(exit.direction)) {
      hasPortal = true;
    }
  }
  if (hasPortal) {
    const badge = document.createElement('span');
    badge.className = 'minimap-portal-badge';
    badge.textContent = 'P';
    cell.appendChild(badge);
  }
}

export function renderMinimap(ctx: GameContext): void {
  ctx.minimap.innerHTML = '';
  const center = ctx.currentRoomId !== null ? ctx.roomCoord.get(ctx.currentRoomId) : undefined;
  if (!center) return;

  for (let dy = MINIMAP_ROW_START; dy <= MINIMAP_ROW_END; dy++) {
    for (let dx = -MINIMAP_COL_RADIUS; dx <= MINIMAP_COL_RADIUS; dx++) {
      const roomId = ctx.coordRoom.get(`${center.zoneId}:${center.x + dx},${center.y + dy}`);
      const cell = document.createElement('span');
      cell.className = 'minimap-cell';
      if (roomId !== undefined) {
        cell.classList.add('minimap-visited');
        if (roomId === ctx.currentRoomId) cell.classList.add('minimap-current');
        const exits = ctx.roomExits.get(roomId);
        if (exits) renderMinimapExits(cell, exits);
        if (roomId === ctx.lastDeathRoomId) {
          const deathMarker = document.createElement('span');
          deathMarker.className = 'minimap-death-marker';
          deathMarker.textContent = '✕';
          cell.appendChild(deathMarker);
        }
        cell.title = ctx.roomNames.get(roomId) ?? '';
      }
      ctx.minimap.appendChild(cell);
    }
  }
}
