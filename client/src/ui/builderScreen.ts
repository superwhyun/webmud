import { DIRECTION_LABELS } from '@mud/shared';
import {
  type BuilderExitDto,
  type BuilderRoomDto,
  type ItemTemplateDto,
  type MobSpawnDto,
  type MobTemplateDto,
  type NpcSpawnDto,
  type NpcTemplateDto,
  type RoomItemDto,
  createBuilderRoom,
  deleteBuilderRoom,
  fetchBuilderItemTemplates,
  fetchBuilderMobSpawns,
  fetchBuilderMobTemplates,
  fetchBuilderNpcSpawns,
  fetchBuilderNpcTemplates,
  fetchBuilderRoomItems,
  fetchBuilderRooms,
  placeBuilderMobSpawn,
  placeBuilderNpcSpawn,
  placeBuilderRoomItem,
  removeBuilderMobSpawn,
  removeBuilderNpcSpawn,
  removeBuilderRoomItem,
  setExitBlocked,
  updateBuilderRoom,
} from '../builderApi';
import { escapeHtml } from '../domUtils';

const PLACEHOLDER_OWNED_QTY = 9999;

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID_SPACING = 160;
const NODE_WIDTH = 140;
const NODE_HEIGHT = 56;
const CANVAS_PADDING = 100;
const EDGE_OFFSET = 5;
const EDGE_GAP = 6;

type CardinalDirection = 'north' | 'south' | 'east' | 'west';

const CARDINAL_OFFSET: Record<CardinalDirection, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};
const CARDINAL_DIRECTIONS = Object.keys(CARDINAL_OFFSET) as CardinalDirection[];

interface Point {
  x: number;
  y: number;
}

interface EdgeEntry {
  fromId: number;
  toId: number;
  direction: string;
  blocked: boolean;
}

export function renderBuilderScreen(container: HTMLElement, token: string, onBack: () => void): void {
  container.innerHTML = `
    <div class="builder-screen">
      <div class="builder-toolbar">
        <span class="builder-title">빌더</span>
        <button type="button" id="builder-add-room">+ 방 추가</button>
        <span class="builder-toolbar-error" id="builder-toolbar-error"></span>
        <button type="button" id="builder-back">게임으로 돌아가기</button>
      </div>
      <div class="builder-body">
        <div class="builder-canvas-wrap" id="builder-canvas-wrap">
          <svg class="builder-canvas" id="builder-canvas"></svg>
        </div>
        <aside class="builder-panel" id="builder-panel">
          <p class="builder-panel-empty">방을 선택하세요.</p>
        </aside>
      </div>
    </div>
  `;

  const svg = container.querySelector<SVGSVGElement>('#builder-canvas')!;
  const panel = container.querySelector<HTMLDivElement>('#builder-panel')!;
  const addRoomButton = container.querySelector<HTMLButtonElement>('#builder-add-room')!;
  const backButton = container.querySelector<HTMLButtonElement>('#builder-back')!;
  const toolbarError = container.querySelector<HTMLSpanElement>('#builder-toolbar-error')!;

  let rooms: BuilderRoomDto[] = [];
  let selectedRoomId: number | null = null;
  let panelMode: 'create' | 'edit' | 'empty' = 'empty';

  let itemTemplates: ItemTemplateDto[] = [];
  let mobTemplates: MobTemplateDto[] = [];
  let roomItems: RoomItemDto[] = [];
  let mobSpawns: MobSpawnDto[] = [];
  let npcTemplates: NpcTemplateDto[] = [];
  let npcSpawns: NpcSpawnDto[] = [];

  const livePositions = new Map<number, Point>();
  const nodeElements = new Map<number, SVGGElement>();
  let dragState: { roomId: number; offsetX: number; offsetY: number; moved: boolean } | null = null;

  function toSvgPoint(clientX: number, clientY: number): Point {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function findRoom(id: number): BuilderRoomDto | undefined {
    return rooms.find((room) => room.id === id);
  }

  function cellOccupant(x: number, y: number, excludeId?: number): BuilderRoomDto | undefined {
    return rooms.find((room) => room.id !== excludeId && room.x === x && room.y === y);
  }

  function availableDirectionsFrom(room: BuilderRoomDto): CardinalDirection[] {
    return CARDINAL_DIRECTIONS.filter((direction) => {
      const offset = CARDINAL_OFFSET[direction];
      return !cellOccupant(room.x + offset.dx, room.y + offset.dy);
    });
  }

  function computeFreeCell(): Point {
    if (rooms.length === 0) return { x: 0, y: 0 };
    const maxY = Math.max(...rooms.map((room) => room.y));
    const targetY = maxY + 2;
    let x = 0;
    while (cellOccupant(x, targetY)) x += 1;
    return { x, y: targetY };
  }

  function showToolbarError(message: string): void {
    toolbarError.textContent = message;
    setTimeout(() => {
      if (toolbarError.textContent === message) toolbarError.textContent = '';
    }, 3000);
  }

  async function refresh(): Promise<void> {
    const result = await fetchBuilderRooms(token);
    rooms = result.rooms;
    renderCanvas();
    renderPanel();
    renderPalette();
  }

  async function refreshPalette(): Promise<void> {
    const [itemsResult, mobTemplatesResult, roomItemsResult, mobSpawnsResult, npcTemplatesResult, npcSpawnsResult] =
      await Promise.all([
        fetchBuilderItemTemplates(token),
        fetchBuilderMobTemplates(token),
        fetchBuilderRoomItems(token),
        fetchBuilderMobSpawns(token),
        fetchBuilderNpcTemplates(token),
        fetchBuilderNpcSpawns(token),
      ]);
    itemTemplates = itemsResult.items;
    mobTemplates = mobTemplatesResult.mobTemplates;
    roomItems = roomItemsResult.roomItems;
    mobSpawns = mobSpawnsResult.mobSpawns;
    npcTemplates = npcTemplatesResult.npcTemplates;
    npcSpawns = npcSpawnsResult.npcSpawns;
    renderPalette();
  }

  function renderPalette(): void {
    const placement = panel.querySelector<HTMLDivElement>('#builder-panel-placement');
    if (!placement) return;

    const room = selectedRoomId !== null ? findRoom(selectedRoomId) : undefined;
    if (!room) return;
    const placedItems = roomItems.filter((row) => row.roomId === room.id);
    const placedMobs = mobSpawns.filter((row) => row.roomId === room.id);
    const placedNpcs = npcSpawns.filter((row) => row.roomId === room.id);

    placement.innerHTML = `
      <h4>보유 아이템</h4>
      <ul class="builder-palette-list">
        ${
          itemTemplates
            .map(
              (item) => `
                <li>
                  <span class="builder-palette-name"><span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> <span class="builder-palette-qty">x${PLACEHOLDER_OWNED_QTY}</span></span>
                  <div class="builder-palette-actions">
                    <input type="number" class="builder-palette-num-input" data-item-qty="${item.id}" value="1" min="1" />
                    <button type="button" data-place-item="${item.id}">배치</button>
                  </div>
                </li>
              `,
            )
            .join('') || '<li class="builder-panel-empty">등록된 아이템이 없습니다.</li>'
        }
      </ul>

      <h4>이 방에 배치된 아이템</h4>
      <ul class="builder-palette-list">
        ${
          placedItems
            .map(
              (row) => `
                    <li>
                      <span><span class="item-grade-${row.itemGrade}">${escapeHtml(row.itemName)}</span> x${row.quantity}</span>
                      <button type="button" class="builder-exit-delete" data-remove-item="${row.id}">제거</button>
                    </li>
                  `,
            )
            .join('') || '<li class="builder-panel-empty">배치된 아이템이 없습니다.</li>'
        }
      </ul>

      <h4>보유 몹</h4>
      <ul class="builder-palette-list">
        ${
          mobTemplates
            .map(
              (mob) => `
                <li>
                  <span class="builder-palette-name">${escapeHtml(mob.name)} <span class="builder-palette-qty">x${PLACEHOLDER_OWNED_QTY}</span></span>
                  <div class="builder-palette-actions">
                    <input type="number" class="builder-palette-num-input" data-mob-respawn="${mob.id}" value="20" min="5" />
                    <button type="button" data-place-mob="${mob.id}">배치</button>
                  </div>
                </li>
              `,
            )
            .join('') || '<li class="builder-panel-empty">등록된 몹이 없습니다.</li>'
        }
      </ul>

      <h4>이 방에 배치된 몹</h4>
      <ul class="builder-palette-list">
        ${
          placedMobs
            .map(
              (row) => `
                    <li>
                      <span>${escapeHtml(row.mobName)} (리스폰 ${row.respawnSeconds}초)</span>
                      <button type="button" class="builder-exit-delete" data-remove-mob="${row.id}">제거</button>
                    </li>
                  `,
            )
            .join('') || '<li class="builder-panel-empty">배치된 몹이 없습니다.</li>'
        }
      </ul>

      <h3>보유 NPC</h3>
      <ul class="builder-palette-list">
        ${
          npcTemplates
            .map(
              (npc) => `
                <li>
                  <span class="builder-palette-name">${escapeHtml(npc.name)} <span class="builder-palette-qty">x${PLACEHOLDER_OWNED_QTY}</span></span>
                  <div class="builder-palette-actions">
                    <button type="button" data-place-npc="${npc.id}">배치</button>
                  </div>
                </li>
              `,
            )
            .join('') || '<li class="builder-panel-empty">등록된 NPC가 없습니다.</li>'
        }
      </ul>

      <h4>이 방에 배치된 NPC</h4>
      <ul class="builder-palette-list">
        ${
          placedNpcs
            .map(
              (row) => `
                    <li>
                      <span>${escapeHtml(row.npcName)}</span>
                      <button type="button" class="builder-exit-delete" data-remove-npc="${row.id}">제거</button>
                    </li>
                  `,
            )
            .join('') || '<li class="builder-panel-empty">배치된 NPC가 없습니다.</li>'
        }
      </ul>
    `;

    placement.querySelectorAll<HTMLButtonElement>('[data-place-item]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = Number(button.dataset.placeItem);
        const qtyInput = placement.querySelector<HTMLInputElement>(`[data-item-qty="${itemId}"]`)!;
        const quantity = Number(qtyInput.value) || 1;
        placeBuilderRoomItem(token, room.id, itemId, quantity)
          .then(() => refreshPalette())
          .catch((error: unknown) => {
            showToolbarError(error instanceof Error ? error.message : '배치에 실패했습니다.');
          });
      });
    });

    placement.querySelectorAll<HTMLButtonElement>('[data-remove-item]').forEach((button) => {
      button.addEventListener('click', () => {
        removeBuilderRoomItem(token, Number(button.dataset.removeItem))
          .then(() => refreshPalette())
          .catch((error: unknown) => {
            showToolbarError(error instanceof Error ? error.message : '제거에 실패했습니다.');
          });
      });
    });

    placement.querySelectorAll<HTMLButtonElement>('[data-place-mob]').forEach((button) => {
      button.addEventListener('click', () => {
        const mobTemplateId = Number(button.dataset.placeMob);
        const respawnInput = placement.querySelector<HTMLInputElement>(`[data-mob-respawn="${mobTemplateId}"]`)!;
        const respawnSeconds = Number(respawnInput.value) || 20;
        placeBuilderMobSpawn(token, room.id, mobTemplateId, respawnSeconds)
          .then(() => refreshPalette())
          .catch((error: unknown) => {
            showToolbarError(error instanceof Error ? error.message : '배치에 실패했습니다.');
          });
      });
    });

    placement.querySelectorAll<HTMLButtonElement>('[data-remove-mob]').forEach((button) => {
      button.addEventListener('click', () => {
        removeBuilderMobSpawn(token, Number(button.dataset.removeMob))
          .then(() => refreshPalette())
          .catch((error: unknown) => {
            showToolbarError(error instanceof Error ? error.message : '제거에 실패했습니다.');
          });
      });
    });

    placement.querySelectorAll<HTMLButtonElement>('[data-place-npc]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!room) return;
        const npcTemplateId = Number(button.dataset.placeNpc);
        placeBuilderNpcSpawn(token, room.id, npcTemplateId)
          .then(() => refreshPalette())
          .catch((error: unknown) => {
            showToolbarError(error instanceof Error ? error.message : '배치에 실패했습니다.');
          });
      });
    });

    placement.querySelectorAll<HTMLButtonElement>('[data-remove-npc]').forEach((button) => {
      button.addEventListener('click', () => {
        removeBuilderNpcSpawn(token, Number(button.dataset.removeNpc))
          .then(() => refreshPalette())
          .catch((error: unknown) => {
            showToolbarError(error instanceof Error ? error.message : '제거에 실패했습니다.');
          });
      });
    });
  }

  function collectEdges(): EdgeEntry[] {
    const edges: EdgeEntry[] = [];
    for (const room of rooms) {
      for (const exit of room.exits as BuilderExitDto[]) {
        edges.push({ fromId: room.id, toId: exit.targetRoomId, direction: exit.direction, blocked: exit.blocked });
      }
    }
    return edges;
  }

  function groupEdgesByPair(edges: EdgeEntry[]): Map<string, EdgeEntry[]> {
    const groups = new Map<string, EdgeEntry[]>();
    for (const edge of edges) {
      const key = edge.fromId < edge.toId ? `${edge.fromId}:${edge.toId}` : `${edge.toId}:${edge.fromId}`;
      const list = groups.get(key) ?? [];
      list.push(edge);
      groups.set(key, list);
    }
    return groups;
  }

  function renderCanvas(): void {
    svg.innerHTML = '';
    nodeElements.clear();
    livePositions.clear();
    for (const room of rooms) livePositions.set(room.id, { x: room.x * GRID_SPACING, y: room.y * GRID_SPACING });

    if (rooms.length === 0) {
      svg.setAttribute('width', '400');
      svg.setAttribute('height', '200');
      return;
    }

    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', 'builder-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '9');
    marker.setAttribute('markerHeight', '9');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrowPath = document.createElementNS(SVG_NS, 'path');
    arrowPath.setAttribute('d', 'M0,0 L10,5 L0,10 z');
    arrowPath.setAttribute('class', 'builder-arrow-head');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const marker2 = document.createElementNS(SVG_NS, 'marker');
    marker2.setAttribute('id', 'builder-arrow-blocked');
    marker2.setAttribute('viewBox', '0 0 10 10');
    marker2.setAttribute('refX', '9');
    marker2.setAttribute('refY', '5');
    marker2.setAttribute('markerWidth', '9');
    marker2.setAttribute('markerHeight', '9');
    marker2.setAttribute('orient', 'auto-start-reverse');
    const arrowPath2 = document.createElementNS(SVG_NS, 'path');
    arrowPath2.setAttribute('d', 'M0,0 L10,5 L0,10 z');
    arrowPath2.setAttribute('class', 'builder-arrow-head-blocked');
    marker2.appendChild(arrowPath2);
    defs.appendChild(marker2);

    const xs = [...livePositions.values()].map((pos) => pos.x);
    const ys = [...livePositions.values()].map((pos) => pos.y);
    const minX = Math.min(...xs) - NODE_WIDTH / 2 - CANVAS_PADDING;
    const minY = Math.min(...ys) - NODE_HEIGHT / 2 - CANVAS_PADDING;
    const maxX = Math.max(...xs) + NODE_WIDTH / 2 + CANVAS_PADDING;
    const maxY = Math.max(...ys) + NODE_HEIGHT / 2 + CANVAS_PADDING;
    const width = maxX - minX;
    const height = maxY - minY;

    svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    const edgeLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(edgeLayer);

    const groups = groupEdgesByPair(collectEdges());
    for (const [, groupEdges] of groups) {
      const offset = groupEdges.length > 1 ? EDGE_OFFSET : 0;
      for (const edge of groupEdges) {
        const from = livePositions.get(edge.fromId);
        const to = livePositions.get(edge.toId);
        if (!from || !to) continue;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * offset;
        const ny = (dx / len) * offset;

        // Grid connections are always axis-aligned, so trim each end back by half the node's
        // size along that axis (plus a small gap) so the arrowhead lands in open space instead
        // of being drawn underneath the (opaque) destination node rectangle.
        const inset = dx !== 0 ? NODE_WIDTH / 2 + EDGE_GAP : NODE_HEIGHT / 2 + EDGE_GAP;
        const ux = dx / len;
        const uy = dy / len;
        const lineFromX = from.x + nx + ux * inset;
        const lineFromY = from.y + ny + uy * inset;
        const lineToX = to.x + nx - ux * inset;
        const lineToY = to.y + ny - uy * inset;

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'builder-edge-group');
        g.setAttribute('data-room-id', String(edge.fromId));
        g.setAttribute('data-direction', edge.direction);

        const hit = document.createElementNS(SVG_NS, 'line');
        hit.setAttribute('x1', String(from.x + nx));
        hit.setAttribute('y1', String(from.y + ny));
        hit.setAttribute('x2', String(to.x + nx));
        hit.setAttribute('y2', String(to.y + ny));
        hit.setAttribute('class', 'builder-edge-hit');
        g.appendChild(hit);

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(lineFromX));
        line.setAttribute('y1', String(lineFromY));
        line.setAttribute('x2', String(lineToX));
        line.setAttribute('y2', String(lineToY));
        line.setAttribute('class', edge.blocked ? 'builder-edge builder-edge-blocked' : 'builder-edge');
        line.setAttribute('marker-end', edge.blocked ? 'url(#builder-arrow-blocked)' : 'url(#builder-arrow)');
        g.appendChild(line);

        g.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
          setExitBlocked(token, edge.fromId, edge.direction, !edge.blocked)
            .then(() => refresh())
            .catch((error: unknown) => {
              showToolbarError(error instanceof Error ? error.message : '출구 상태 변경에 실패했습니다.');
            });
        });

        edgeLayer.appendChild(g);
      }
    }

    const nodeLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(nodeLayer);

    for (const room of rooms) {
      const pos = livePositions.get(room.id);
      if (!pos) continue;

      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'builder-node');
      group.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      group.setAttribute('data-room-id', String(room.id));

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(-NODE_WIDTH / 2));
      rect.setAttribute('y', String(-NODE_HEIGHT / 2));
      rect.setAttribute('width', String(NODE_WIDTH));
      rect.setAttribute('height', String(NODE_HEIGHT));
      rect.setAttribute('rx', '6');
      rect.setAttribute('class', room.id === selectedRoomId ? 'builder-node-rect builder-node-selected' : 'builder-node-rect');
      group.appendChild(rect);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'builder-node-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      const displayName = room.name.length > 12 ? `${room.name.slice(0, 12)}…` : room.name;
      label.textContent = displayName;
      group.appendChild(label);

      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = room.name;
      group.appendChild(title);

      group.addEventListener('pointerdown', (event: PointerEvent) => {
        event.stopPropagation();
        const currentPos = livePositions.get(room.id)!;
        const svgPoint = toSvgPoint(event.clientX, event.clientY);
        dragState = { roomId: room.id, offsetX: svgPoint.x - currentPos.x, offsetY: svgPoint.y - currentPos.y, moved: false };
        group.setPointerCapture(event.pointerId);
      });

      group.addEventListener('pointermove', (event: PointerEvent) => {
        if (!dragState || dragState.roomId !== room.id) return;
        const svgPoint = toSvgPoint(event.clientX, event.clientY);
        const nextPos = { x: svgPoint.x - dragState.offsetX, y: svgPoint.y - dragState.offsetY };
        dragState.moved = true;
        livePositions.set(room.id, nextPos);
        group.setAttribute('transform', `translate(${nextPos.x}, ${nextPos.y})`);
      });

      group.addEventListener('pointerup', (event: PointerEvent) => {
        if (!dragState || dragState.roomId !== room.id) return;
        const wasMoved = dragState.moved;
        group.releasePointerCapture(event.pointerId);
        dragState = null;

        if (!wasMoved) {
          selectedRoomId = room.id;
          panelMode = 'edit';
          renderCanvas();
          renderPanel();
          renderPalette();
          return;
        }

        const livePos = livePositions.get(room.id)!;
        const gridX = Math.round(livePos.x / GRID_SPACING);
        const gridY = Math.round(livePos.y / GRID_SPACING);

        if (gridX === room.x && gridY === room.y) {
          renderCanvas();
          return;
        }

        if (cellOccupant(gridX, gridY, room.id)) {
          showToolbarError('이미 그 위치에 방이 있습니다.');
          renderCanvas();
          return;
        }

        updateBuilderRoom(token, room.id, { x: gridX, y: gridY })
          .then(() => refresh())
          .catch((error: unknown) => {
            showToolbarError(error instanceof Error ? error.message : '이동에 실패했습니다.');
            renderCanvas();
          });
      });

      nodeLayer.appendChild(group);
      nodeElements.set(room.id, group);
    }
  }

  function fieldRow(labelText: string, inputHtml: string): string {
    return `<div class="builder-field"><label>${labelText}</label>${inputHtml}</div>`;
  }

  function renderPanel(): void {
    if (panelMode === 'create') {
      const anchor = selectedRoomId !== null ? findRoom(selectedRoomId) : undefined;
      const directions = anchor ? availableDirectionsFrom(anchor) : [];
      const willLink = Boolean(anchor && directions.length > 0);

      const hint = willLink
        ? `<p class="builder-panel-hint">"${escapeHtml(anchor!.name)}"에 연결된 새 방을 만듭니다.</p>`
        : anchor
          ? `<p class="builder-panel-hint">"${escapeHtml(anchor.name)}" 주변에 빈 칸이 없어 독립된 위치에 만듭니다.</p>`
          : `<p class="builder-panel-hint">방을 선택하지 않아 독립된 위치에 만듭니다.</p>`;

      panel.innerHTML = `
        <h3>새 방</h3>
        ${hint}
        ${
          willLink
            ? fieldRow(
                '방향',
                `<select id="builder-new-direction">${directions
                  .map((direction) => `<option value="${direction}">${DIRECTION_LABELS[direction]}</option>`)
                  .join('')}</select>`,
              )
            : ''
        }
        ${fieldRow('이름', '<input id="builder-new-name" type="text" maxlength="50" />')}
        ${fieldRow('설명', '<textarea id="builder-new-desc" maxlength="500" rows="4"></textarea>')}
        <p class="builder-error" id="builder-create-error"></p>
        <div class="builder-form-row">
          <button type="button" id="builder-create-confirm">만들기</button>
          <button type="button" id="builder-create-cancel">취소</button>
        </div>
      `;
      const errorEl = panel.querySelector<HTMLParagraphElement>('#builder-create-error')!;
      panel.querySelector<HTMLButtonElement>('#builder-create-cancel')!.addEventListener('click', () => {
        panelMode = 'empty';
        renderPanel();
      });
      panel.querySelector<HTMLButtonElement>('#builder-create-confirm')!.addEventListener('click', () => {
        const name = panel.querySelector<HTMLInputElement>('#builder-new-name')!.value.trim();
        const description = panel.querySelector<HTMLTextAreaElement>('#builder-new-desc')!.value.trim();
        if (!name || !description) {
          errorEl.textContent = '이름과 설명을 모두 입력하세요.';
          return;
        }

        let target: Point;
        if (willLink) {
          const direction = panel.querySelector<HTMLSelectElement>('#builder-new-direction')!.value as CardinalDirection;
          const offset = CARDINAL_OFFSET[direction];
          target = { x: anchor!.x + offset.dx, y: anchor!.y + offset.dy };
        } else {
          target = computeFreeCell();
        }

        createBuilderRoom(token, name, description, target.x, target.y)
          .then((result) => {
            selectedRoomId = result.room.id;
            panelMode = 'edit';
            return refresh();
          })
          .catch((error: unknown) => {
            errorEl.textContent = error instanceof Error ? error.message : '방 생성에 실패했습니다.';
          });
      });
      return;
    }

    if (panelMode === 'edit' && selectedRoomId !== null) {
      const room = findRoom(selectedRoomId);
      if (!room) {
        panelMode = 'empty';
        renderPanel();
        return;
      }

      panel.innerHTML = `
        <h3>방 편집</h3>
        ${fieldRow('이름', '<input id="builder-edit-name" type="text" maxlength="50" />')}
        ${fieldRow('설명', '<textarea id="builder-edit-desc" maxlength="500" rows="4"></textarea>')}
        <p class="builder-error" id="builder-edit-error"></p>
        <div class="builder-form-row">
          <button type="button" id="builder-edit-save">저장</button>
        </div>

        <h4>출구</h4>
        <p class="builder-panel-hint">출구는 지도에서 방을 드래그해 인접시키거나 떨어뜨려서 관리합니다. 화살표를 클릭하면 해당 방향을 막거나 열 수 있습니다.</p>

        <div id="builder-panel-placement"></div>

        <div class="builder-form-row">
          <button type="button" id="builder-room-delete">방 삭제</button>
        </div>
      `;

      panel.querySelector<HTMLInputElement>('#builder-edit-name')!.value = room.name;
      panel.querySelector<HTMLTextAreaElement>('#builder-edit-desc')!.value = room.description;

      const errorEl = panel.querySelector<HTMLParagraphElement>('#builder-edit-error')!;

      panel.querySelector<HTMLButtonElement>('#builder-edit-save')!.addEventListener('click', () => {
        const name = panel.querySelector<HTMLInputElement>('#builder-edit-name')!.value.trim();
        const description = panel.querySelector<HTMLTextAreaElement>('#builder-edit-desc')!.value.trim();
        if (!name || !description) {
          errorEl.textContent = '이름과 설명을 모두 입력하세요.';
          return;
        }
        updateBuilderRoom(token, room.id, { name, description })
          .then(() => refresh())
          .catch((error: unknown) => {
            errorEl.textContent = error instanceof Error ? error.message : '수정에 실패했습니다.';
          });
      });

      panel.querySelector<HTMLButtonElement>('#builder-room-delete')!.addEventListener('click', () => {
        if (!confirm(`"${room.name}" 방을 삭제할까요? 연결된 출구도 함께 제거됩니다.`)) return;
        deleteBuilderRoom(token, room.id)
          .then(() => {
            selectedRoomId = null;
            panelMode = 'empty';
            return refresh();
          })
          .catch((error: unknown) => {
            errorEl.textContent = error instanceof Error ? error.message : '삭제에 실패했습니다.';
          });
      });
      return;
    }

    panel.innerHTML = '<p class="builder-panel-empty">방을 선택하세요.</p>';
  }

  svg.addEventListener('pointerdown', () => {
    selectedRoomId = null;
    panelMode = 'empty';
    renderCanvas();
    renderPanel();
    renderPalette();
  });

  addRoomButton.addEventListener('click', () => {
    panelMode = 'create';
    renderPanel();
  });

  backButton.addEventListener('click', onBack);

  void refresh();
  void refreshPalette();
}
