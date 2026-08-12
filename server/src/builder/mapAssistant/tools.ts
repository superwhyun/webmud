import type OpenAI from 'openai';
import { z } from 'zod';

export const addRoomArgsSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  x: z.number().int(),
  y: z.number().int(),
});

export const addMobSpawnArgsSchema = z.object({
  roomRef: z.string().min(1),
  mobTemplateId: z.number().int(),
  respawnSeconds: z.number().int().min(5).default(20),
});

export const addRoomItemArgsSchema = z.object({
  roomRef: z.string().min(1),
  itemId: z.number().int(),
  quantity: z.number().int().min(1).default(1),
});

export const addNpcSpawnArgsSchema = z.object({
  roomRef: z.string().min(1),
  npcTemplateId: z.number().int(),
});

/**
 * Tool set exposed to the map assistant LLM. Deliberately additive-only (no delete/move) so proposals
 * can never disrupt players standing in existing rooms — see plan doc for the reasoning.
 * `roomRef` lets a tool call target either an existing room (its numeric id as a string) or a room
 * created earlier in the same proposal (the `tempId` returned by `add_room`).
 */
export const MAP_ASSISTANT_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: 'function',
    name: 'add_room',
    description: '현재 존(zone)에 새 방을 추가한다. 기존 방 및 이번 제안에서 이미 추가한 방과 좌표(x, y)가 겹치면 안 된다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '방 이름' },
        description: { type: 'string', description: '방 설명' },
        x: { type: 'integer', description: '그리드 x 좌표' },
        y: { type: 'integer', description: '그리드 y 좌표' },
      },
      required: ['name', 'description', 'x', 'y'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'add_mob_spawn',
    description: '방에 몹 스폰을 추가한다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        roomRef: {
          type: 'string',
          description: '대상 방의 id(스냅샷의 rooms[].id를 문자열로) 또는 이번 제안에서 add_room이 반환한 tempId',
        },
        mobTemplateId: { type: 'integer', description: '스냅샷의 availableMobTemplates 중 하나의 id' },
        respawnSeconds: { type: 'integer', description: '리스폰 대기시간(초). 기본 20' },
      },
      required: ['roomRef', 'mobTemplateId', 'respawnSeconds'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'add_room_item',
    description: '방에 아이템을 배치한다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        roomRef: {
          type: 'string',
          description: '대상 방의 id(스냅샷의 rooms[].id를 문자열로) 또는 이번 제안에서 add_room이 반환한 tempId',
        },
        itemId: { type: 'integer', description: '스냅샷의 availableItemTemplates 중 하나의 id' },
        quantity: { type: 'integer', description: '수량. 기본 1' },
      },
      required: ['roomRef', 'itemId', 'quantity'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'add_npc_spawn',
    description: '방에 NPC(상인 등)를 배치한다. 마을이 아닌 사냥터 존이라면 보통 NPC는 거의 배치하지 않는다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        roomRef: {
          type: 'string',
          description: '대상 방의 id(스냅샷의 rooms[].id를 문자열로) 또는 이번 제안에서 add_room이 반환한 tempId',
        },
        npcTemplateId: { type: 'integer', description: '스냅샷의 availableNpcTemplates 중 하나의 id' },
      },
      required: ['roomRef', 'npcTemplateId'],
      additionalProperties: false,
    },
  },
];
