import type OpenAI from 'openai';
import { MAX_OPERATIONS, MAX_TOOL_CALL_ITERATIONS, OPENAI_MODEL, getOpenAiClient } from './config.js';
import type { AddMobSpawnOperation, AddRoomItemOperation, AddRoomOperation, ProposedOperation } from './operations.js';
import { buildZoneSnapshot, type ZoneSnapshotDto } from './snapshot.js';
import { addMobSpawnArgsSchema, addRoomArgsSchema, addRoomItemArgsSchema, MAP_ASSISTANT_TOOLS } from './tools.js';

export type ProposeOutcome = { operations: ProposedOperation[]; summary: string } | { error: string; status: number };

interface SimRoom {
  ref: string;
  name: string;
  x: number;
  y: number;
}

/** Tracks what the model has proposed so far within one propose() call, so later tool calls (e.g. add_mob_spawn
 * targeting a room the model just created) can be validated without touching the database. */
class ProposalState {
  private readonly rooms = new Map<string, SimRoom>();
  private readonly occupiedCells = new Set<string>();
  private readonly validMobTemplateIds: Map<number, string>;
  private readonly validItemIds: Map<number, string>;
  private nextTempId = 1;

  constructor(snapshot: ZoneSnapshotDto) {
    this.validMobTemplateIds = new Map(snapshot.availableMobTemplates.map((t) => [t.id, t.name]));
    this.validItemIds = new Map(snapshot.availableItemTemplates.map((t) => [t.id, t.name]));
    for (const room of snapshot.rooms) {
      this.rooms.set(String(room.id), { ref: String(room.id), name: room.name, x: room.x, y: room.y });
      this.occupiedCells.add(`${room.x},${room.y}`);
    }
  }

  addRoom(name: string, x: number, y: number): { tempId: string } | { error: string } {
    const cellKey = `${x},${y}`;
    if (this.occupiedCells.has(cellKey)) {
      return { error: `(${x}, ${y}) 좌표에는 이미 방이 있습니다. 다른 좌표를 사용하세요.` };
    }
    const tempId = `new:${this.nextTempId++}`;
    this.rooms.set(tempId, { ref: tempId, name, x, y });
    this.occupiedCells.add(cellKey);
    return { tempId };
  }

  resolveRoom(roomRef: string): SimRoom | { error: string } {
    const room = this.rooms.get(roomRef);
    if (!room) {
      return { error: `roomRef "${roomRef}"는 스냅샷에도 없고 이번 제안에서 만든 방도 아닙니다.` };
    }
    return room;
  }

  mobTemplateName(id: number): string | { error: string } {
    const name = this.validMobTemplateIds.get(id);
    return name ?? { error: `mobTemplateId ${id}는 availableMobTemplates에 없습니다.` };
  }

  itemName(id: number): string | { error: string } {
    const name = this.validItemIds.get(id);
    return name ?? { error: `itemId ${id}는 availableItemTemplates에 없습니다.` };
  }
}

function buildInstructions(): string {
  return [
    'You are a level design assistant for a text-based MUD. You edit one zone at a time by calling the provided tools.',
    'Only propose changes that additively grow the zone: new rooms, new mob spawns, new item drops. Never suggest deleting or moving anything, since those tools do not exist.',
    'New rooms must use integer grid coordinates that do not collide with existing rooms or rooms you already added in this same request.',
    'Only use mobTemplateId / itemId values that appear in availableMobTemplates / availableItemTemplates from the snapshot.',
    `Keep proposals reasonably scoped: no more than ${MAX_OPERATIONS} tool calls total in one request.`,
    '방 이름/설명, 몹/아이템 관련 텍스트는 한국어로 작성하세요.',
    'When you are done, reply with a short Korean summary of what you proposed (no more tool calls).',
  ].join('\n');
}

function parseArgs<T>(schema: { safeParse: (input: unknown) => { success: boolean; data?: T; error?: unknown } }, raw: string): T | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: '인자를 JSON으로 파싱할 수 없습니다.' };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success || parsed.data === undefined) {
    return { error: '인자가 스키마와 맞지 않습니다.' };
  }
  return parsed.data;
}

function executeToolCall(
  name: string,
  argsJson: string,
  state: ProposalState,
  operations: ProposedOperation[],
): { output: unknown } {
  if (operations.length >= MAX_OPERATIONS) {
    return { output: { error: `한 번에 제안 가능한 변경 개수(${MAX_OPERATIONS})를 넘었습니다. 여기서 멈추고 요약하세요.` } };
  }

  if (name === 'add_room') {
    const args = parseArgs(addRoomArgsSchema, argsJson);
    if ('error' in args) return { output: args };
    const result = state.addRoom(args.name, args.x, args.y);
    if ('error' in result) return { output: result };
    const op: AddRoomOperation = {
      type: 'add_room',
      tempId: result.tempId,
      name: args.name,
      description: args.description,
      x: args.x,
      y: args.y,
    };
    operations.push(op);
    return { output: { tempId: result.tempId } };
  }

  if (name === 'add_mob_spawn') {
    const args = parseArgs(addMobSpawnArgsSchema, argsJson);
    if ('error' in args) return { output: args };
    const room = state.resolveRoom(args.roomRef);
    if ('error' in room) return { output: room };
    const mobName = state.mobTemplateName(args.mobTemplateId);
    if (typeof mobName !== 'string') return { output: mobName };
    const op: AddMobSpawnOperation = {
      type: 'add_mob_spawn',
      roomRef: args.roomRef,
      roomLabel: room.name,
      mobTemplateId: args.mobTemplateId,
      mobName,
      respawnSeconds: args.respawnSeconds,
    };
    operations.push(op);
    return { output: { ok: true } };
  }

  if (name === 'add_room_item') {
    const args = parseArgs(addRoomItemArgsSchema, argsJson);
    if ('error' in args) return { output: args };
    const room = state.resolveRoom(args.roomRef);
    if ('error' in room) return { output: room };
    const itemName = state.itemName(args.itemId);
    if (typeof itemName !== 'string') return { output: itemName };
    const op: AddRoomItemOperation = {
      type: 'add_room_item',
      roomRef: args.roomRef,
      roomLabel: room.name,
      itemId: args.itemId,
      itemName,
      quantity: args.quantity,
    };
    operations.push(op);
    return { output: { ok: true } };
  }

  return { output: { error: `알 수 없는 tool: ${name}` } };
}

export async function proposeChanges(zoneId: number, prompt: string): Promise<ProposeOutcome> {
  const snapshot = buildZoneSnapshot(zoneId);
  if (!snapshot) {
    return { error: '존을 찾을 수 없습니다.', status: 404 };
  }

  const client = getOpenAiClient();
  const state = new ProposalState(snapshot);
  const operations: ProposedOperation[] = [];

  let response = await client.responses.create({
    model: OPENAI_MODEL,
    instructions: buildInstructions(),
    tools: MAP_ASSISTANT_TOOLS,
    input: [
      { role: 'user', content: `현재 존 스냅샷(JSON):\n${JSON.stringify(snapshot)}` },
      { role: 'user', content: prompt },
    ],
  });

  for (let iteration = 0; iteration < MAX_TOOL_CALL_ITERATIONS; iteration += 1) {
    const functionCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
    );
    if (functionCalls.length === 0) break;

    const outputs: OpenAI.Responses.ResponseInputItem.FunctionCallOutput[] = functionCalls.map((call) => {
      const { output } = executeToolCall(call.name, call.arguments, state, operations);
      return { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) };
    });

    response = await client.responses.create({
      model: OPENAI_MODEL,
      previous_response_id: response.id,
      tools: MAP_ASSISTANT_TOOLS,
      input: outputs,
    });
  }

  return { operations, summary: response.output_text || '(모델이 요약을 반환하지 않았습니다.)' };
}
