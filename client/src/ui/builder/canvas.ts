import { setExitBlocked, updateBuilderRoom, type BuilderExitDto } from '../../builderApi';
import { cellOccupant, showToolbarError, type BuilderContext, type EdgeEntry, type Point } from './context';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID_SPACING = 160;
const NODE_WIDTH = 140;
const NODE_HEIGHT = 56;
const CANVAS_PADDING = 100;
const EDGE_OFFSET = 5;
const EDGE_GAP = 6;

function toSvgPoint(ctx: BuilderContext, clientX: number, clientY: number): Point {
  const point = ctx.svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = ctx.svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

function collectEdges(ctx: BuilderContext): EdgeEntry[] {
  const edges: EdgeEntry[] = [];
  for (const room of ctx.rooms) {
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

export function renderCanvas(ctx: BuilderContext): void {
  ctx.svg.innerHTML = '';
  ctx.nodeElements.clear();
  ctx.livePositions.clear();
  for (const room of ctx.rooms) ctx.livePositions.set(room.id, { x: room.x * GRID_SPACING, y: room.y * GRID_SPACING });

  if (ctx.rooms.length === 0) {
    ctx.svg.setAttribute('width', '400');
    ctx.svg.setAttribute('height', '200');
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
  ctx.svg.appendChild(defs);

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

  const xs = [...ctx.livePositions.values()].map((pos) => pos.x);
  const ys = [...ctx.livePositions.values()].map((pos) => pos.y);
  const minX = Math.min(...xs) - NODE_WIDTH / 2 - CANVAS_PADDING;
  const minY = Math.min(...ys) - NODE_HEIGHT / 2 - CANVAS_PADDING;
  const maxX = Math.max(...xs) + NODE_WIDTH / 2 + CANVAS_PADDING;
  const maxY = Math.max(...ys) + NODE_HEIGHT / 2 + CANVAS_PADDING;
  const width = maxX - minX;
  const height = maxY - minY;

  ctx.svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
  ctx.svg.setAttribute('width', String(width));
  ctx.svg.setAttribute('height', String(height));

  const edgeLayer = document.createElementNS(SVG_NS, 'g');
  ctx.svg.appendChild(edgeLayer);

  const groups = groupEdgesByPair(collectEdges(ctx));
  for (const [, groupEdges] of groups) {
    const offset = groupEdges.length > 1 ? EDGE_OFFSET : 0;
    for (const edge of groupEdges) {
      const from = ctx.livePositions.get(edge.fromId);
      const to = ctx.livePositions.get(edge.toId);
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
        setExitBlocked(ctx.token, edge.fromId, edge.direction, !edge.blocked)
          .then(() => ctx.refresh())
          .catch((error: unknown) => {
            showToolbarError(ctx, error instanceof Error ? error.message : '출구 상태 변경에 실패했습니다.');
          });
      });

      edgeLayer.appendChild(g);
    }
  }

  const nodeLayer = document.createElementNS(SVG_NS, 'g');
  ctx.svg.appendChild(nodeLayer);

  for (const room of ctx.rooms) {
    const pos = ctx.livePositions.get(room.id);
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
    rect.setAttribute('class', room.id === ctx.selectedRoomId ? 'builder-node-rect builder-node-selected' : 'builder-node-rect');
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
      const currentPos = ctx.livePositions.get(room.id)!;
      const svgPoint = toSvgPoint(ctx, event.clientX, event.clientY);
      ctx.dragState = { roomId: room.id, offsetX: svgPoint.x - currentPos.x, offsetY: svgPoint.y - currentPos.y, moved: false };
      group.setPointerCapture(event.pointerId);
    });

    group.addEventListener('pointermove', (event: PointerEvent) => {
      if (!ctx.dragState || ctx.dragState.roomId !== room.id) return;
      const svgPoint = toSvgPoint(ctx, event.clientX, event.clientY);
      const nextPos = { x: svgPoint.x - ctx.dragState.offsetX, y: svgPoint.y - ctx.dragState.offsetY };
      ctx.dragState.moved = true;
      ctx.livePositions.set(room.id, nextPos);
      group.setAttribute('transform', `translate(${nextPos.x}, ${nextPos.y})`);
    });

    group.addEventListener('pointerup', (event: PointerEvent) => {
      if (!ctx.dragState || ctx.dragState.roomId !== room.id) return;
      const wasMoved = ctx.dragState.moved;
      group.releasePointerCapture(event.pointerId);
      ctx.dragState = null;

      if (!wasMoved) {
        ctx.selectedRoomId = room.id;
        ctx.panelMode = 'edit';
        ctx.rerenderAll();
        return;
      }

      const livePos = ctx.livePositions.get(room.id)!;
      const gridX = Math.round(livePos.x / GRID_SPACING);
      const gridY = Math.round(livePos.y / GRID_SPACING);

      if (gridX === room.x && gridY === room.y) {
        renderCanvas(ctx);
        return;
      }

      if (cellOccupant(ctx, gridX, gridY, room.id)) {
        showToolbarError(ctx, '이미 그 위치에 방이 있습니다.');
        renderCanvas(ctx);
        return;
      }

      updateBuilderRoom(ctx.token, room.id, { x: gridX, y: gridY })
        .then(() => ctx.refresh())
        .catch((error: unknown) => {
          showToolbarError(ctx, error instanceof Error ? error.message : '이동에 실패했습니다.');
          renderCanvas(ctx);
        });
    });

    nodeLayer.appendChild(group);
    ctx.nodeElements.set(room.id, group);
  }
}
