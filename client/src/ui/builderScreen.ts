import { DIRECTION_LABELS, DIRECTION_VALUES } from '@mud/shared';
import {
  type BuilderRoomDto,
  createBuilderExit,
  createBuilderRoom,
  deleteBuilderExit,
  deleteBuilderRoom,
  fetchBuilderRooms,
  updateBuilderRoom,
} from '../builderApi';
import { escapeHtml } from '../domUtils';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID_SPACING = 160;
const NODE_WIDTH = 140;
const NODE_HEIGHT = 56;
const CANVAS_PADDING = 100;
const POSITIONS_KEY = 'mud_builder_positions';

const CARDINAL_OFFSET: Record<string, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

interface Point {
  x: number;
  y: number;
}

function loadSavedPositions(): Map<number, Point> {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, Point>) : {};
    return new Map(Object.entries(parsed).map(([id, pos]) => [Number(id), pos]));
  } catch {
    return new Map();
  }
}

function persistPosition(positions: Map<number, Point>, roomId: number, pos: Point): void {
  positions.set(roomId, pos);
  const plain: Record<string, Point> = {};
  for (const [id, p] of positions) plain[id] = p;
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(plain));
}

function computeLayout(rooms: BuilderRoomDto[], saved: Map<number, Point>): Map<number, Point> {
  const positions = new Map(saved);
  const roomsById = new Map(rooms.map((room) => [room.id, room]));

  const queue = [...positions.keys()].filter((id) => roomsById.has(id));
  if (queue.length === 0 && rooms.length > 0) {
    positions.set(rooms[0].id, { x: 0, y: 0 });
    queue.push(rooms[0].id);
  }
  const visited = new Set(queue);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = roomsById.get(currentId);
    const currentPos = positions.get(currentId);
    if (!current || !currentPos) continue;

    for (const exit of current.exits) {
      const offset = CARDINAL_OFFSET[exit.direction];
      if (!offset || positions.has(exit.targetRoomId) || !roomsById.has(exit.targetRoomId)) continue;
      positions.set(exit.targetRoomId, {
        x: currentPos.x + offset.dx * GRID_SPACING,
        y: currentPos.y + offset.dy * GRID_SPACING,
      });
      if (!visited.has(exit.targetRoomId)) {
        visited.add(exit.targetRoomId);
        queue.push(exit.targetRoomId);
      }
    }
  }

  const unplaced = rooms.filter((room) => !positions.has(room.id));
  if (unplaced.length > 0) {
    const ys = [...positions.values()].map((pos) => pos.y);
    const rowY = (ys.length > 0 ? Math.max(...ys) : 0) + GRID_SPACING * 2;
    unplaced.forEach((room, index) => {
      positions.set(room.id, { x: index * GRID_SPACING, y: rowY });
    });
  }

  return positions;
}

export function renderBuilderScreen(container: HTMLElement, token: string, onBack: () => void): void {
  container.innerHTML = `
    <div class="builder-screen">
      <div class="builder-toolbar">
        <span class="builder-title">빌더</span>
        <button type="button" id="builder-add-room">+ 방 추가</button>
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

  let rooms: BuilderRoomDto[] = [];
  const positions = loadSavedPositions();
  let selectedRoomId: number | null = null;
  let panelMode: 'create' | 'edit' | 'empty' = 'empty';

  const nodeElements = new Map<number, SVGGElement>();
  const edgeElements: { fromId: number; toId: number; line: SVGLineElement }[] = [];
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

  function roomHasAnyExit(roomId: number): boolean {
    if ((findRoom(roomId)?.exits.length ?? 0) > 0) return true;
    return rooms.some((room) => room.exits.some((exit) => exit.targetRoomId === roomId));
  }

  async function refresh(): Promise<void> {
    const result = await fetchBuilderRooms(token);
    rooms = result.rooms;
    const layout = computeLayout(rooms, positions);
    for (const [id, pos] of layout) positions.set(id, pos);
    renderCanvas();
    renderPanel();
  }

  function renderCanvas(): void {
    svg.innerHTML = '';
    nodeElements.clear();
    edgeElements.length = 0;

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
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrowPath = document.createElementNS(SVG_NS, 'path');
    arrowPath.setAttribute('d', 'M0,0 L10,5 L0,10 z');
    arrowPath.setAttribute('class', 'builder-arrow-head');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const xs = [...positions.values()].map((pos) => pos.x);
    const ys = [...positions.values()].map((pos) => pos.y);
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

    for (const room of rooms) {
      const from = positions.get(room.id);
      if (!from) continue;
      for (const exit of room.exits) {
        const to = positions.get(exit.targetRoomId);
        if (!to) continue;
        const isVertical = exit.direction === 'up' || exit.direction === 'down';
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(from.x));
        line.setAttribute('y1', String(from.y));
        line.setAttribute('x2', String(to.x));
        line.setAttribute('y2', String(to.y));
        line.setAttribute('class', isVertical ? 'builder-edge builder-edge-vertical' : 'builder-edge');
        line.setAttribute('marker-end', 'url(#builder-arrow)');
        edgeLayer.appendChild(line);
        edgeElements.push({ fromId: room.id, toId: exit.targetRoomId, line });
      }
    }

    const nodeLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(nodeLayer);

    for (const room of rooms) {
      const pos = positions.get(room.id);
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
        const currentPos = positions.get(room.id)!;
        const svgPoint = toSvgPoint(event.clientX, event.clientY);
        dragState = { roomId: room.id, offsetX: svgPoint.x - currentPos.x, offsetY: svgPoint.y - currentPos.y, moved: false };
        group.setPointerCapture(event.pointerId);
      });

      group.addEventListener('pointermove', (event: PointerEvent) => {
        if (!dragState || dragState.roomId !== room.id) return;
        const svgPoint = toSvgPoint(event.clientX, event.clientY);
        const nextPos = { x: svgPoint.x - dragState.offsetX, y: svgPoint.y - dragState.offsetY };
        dragState.moved = true;
        positions.set(room.id, nextPos);
        group.setAttribute('transform', `translate(${nextPos.x}, ${nextPos.y})`);
        for (const edge of edgeElements) {
          if (edge.fromId === room.id) {
            edge.line.setAttribute('x1', String(nextPos.x));
            edge.line.setAttribute('y1', String(nextPos.y));
          }
          if (edge.toId === room.id) {
            edge.line.setAttribute('x2', String(nextPos.x));
            edge.line.setAttribute('y2', String(nextPos.y));
          }
        }
      });

      group.addEventListener('pointerup', (event: PointerEvent) => {
        if (!dragState || dragState.roomId !== room.id) return;
        const wasMoved = dragState.moved;
        group.releasePointerCapture(event.pointerId);
        dragState = null;
        if (wasMoved) {
          persistPosition(positions, room.id, positions.get(room.id)!);
        } else {
          selectedRoomId = room.id;
          panelMode = 'edit';
          renderCanvas();
          renderPanel();
        }
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
      panel.innerHTML = `
        <h3>새 방</h3>
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
        createBuilderRoom(token, name, description)
          .then(() => {
            panelMode = 'empty';
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

      const usedDirections = new Set(room.exits.map((exit) => exit.direction));
      const availableDirections = DIRECTION_VALUES.filter((direction) => !usedDirections.has(direction));
      const directionOptions = availableDirections
        .map((direction) => `<option value="${direction}">${DIRECTION_LABELS[direction]}</option>`)
        .join('');
      const targetOptions = rooms
        .filter((candidate) => candidate.id !== room.id)
        .map((candidate) => `<option value="${candidate.id}">${escapeHtml(candidate.name)}</option>`)
        .join('');

      const exitItems = room.exits
        .map(
          (exit) => `
            <li class="builder-exit-item" data-direction="${exit.direction}">
              <span>${DIRECTION_LABELS[exit.direction] ?? exit.direction} → ${escapeHtml(findRoom(exit.targetRoomId)?.name ?? '?')}</span>
              <button type="button" class="builder-exit-delete" data-direction="${exit.direction}">삭제</button>
            </li>
          `,
        )
        .join('');

      const blocked = roomHasAnyExit(room.id);

      panel.innerHTML = `
        <h3>방 편집</h3>
        ${fieldRow('이름', '<input id="builder-edit-name" type="text" maxlength="50" />')}
        ${fieldRow('설명', '<textarea id="builder-edit-desc" maxlength="500" rows="4"></textarea>')}
        <p class="builder-error" id="builder-edit-error"></p>
        <div class="builder-form-row">
          <button type="button" id="builder-edit-save">저장</button>
        </div>

        <h4>출구</h4>
        <ul class="builder-exit-list">${exitItems || '<li class="builder-exit-empty">없음</li>'}</ul>

        ${
          availableDirections.length > 0 && targetOptions
            ? `
        <div class="builder-form-row builder-exit-form">
          <select id="builder-exit-direction">${directionOptions}</select>
          <select id="builder-exit-target">${targetOptions}</select>
          <label class="builder-checkbox"><input type="checkbox" id="builder-exit-bidirectional" checked /> 양방향</label>
          <button type="button" id="builder-exit-add">출구 추가</button>
        </div>
        `
            : ''
        }

        <div class="builder-form-row">
          <button type="button" id="builder-room-delete" ${blocked ? 'disabled title="연결된 출구가 있어 삭제할 수 없습니다."' : ''}>방 삭제</button>
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

      panel.querySelectorAll<HTMLButtonElement>('.builder-exit-delete').forEach((button) => {
        button.addEventListener('click', () => {
          const direction = button.dataset.direction!;
          deleteBuilderExit(token, room.id, direction, true)
            .then(() => refresh())
            .catch((error: unknown) => {
              errorEl.textContent = error instanceof Error ? error.message : '출구 삭제에 실패했습니다.';
            });
        });
      });

      const addExitButton = panel.querySelector<HTMLButtonElement>('#builder-exit-add');
      addExitButton?.addEventListener('click', () => {
        const direction = panel.querySelector<HTMLSelectElement>('#builder-exit-direction')!.value;
        const targetRoomId = Number(panel.querySelector<HTMLSelectElement>('#builder-exit-target')!.value);
        const bidirectional = panel.querySelector<HTMLInputElement>('#builder-exit-bidirectional')!.checked;
        createBuilderExit(token, room.id, direction, targetRoomId, bidirectional)
          .then(() => refresh())
          .catch((error: unknown) => {
            errorEl.textContent = error instanceof Error ? error.message : '출구 추가에 실패했습니다.';
          });
      });

      panel.querySelector<HTMLButtonElement>('#builder-room-delete')!.addEventListener('click', () => {
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
  });

  addRoomButton.addEventListener('click', () => {
    selectedRoomId = null;
    panelMode = 'create';
    renderPanel();
  });

  backButton.addEventListener('click', onBack);

  void refresh();
}
