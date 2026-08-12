import { z } from 'zod';

export const addRoomOperationSchema = z.object({
  type: z.literal('add_room'),
  tempId: z.string().min(1),
  name: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  x: z.number().int(),
  y: z.number().int(),
});

export const addMobSpawnOperationSchema = z.object({
  type: z.literal('add_mob_spawn'),
  roomRef: z.string().min(1),
  roomLabel: z.string(),
  mobTemplateId: z.number().int(),
  mobName: z.string(),
  respawnSeconds: z.number().int().min(5),
});

export const addRoomItemOperationSchema = z.object({
  type: z.literal('add_room_item'),
  roomRef: z.string().min(1),
  roomLabel: z.string(),
  itemId: z.number().int(),
  itemName: z.string(),
  quantity: z.number().int().min(1),
});

export const addNpcSpawnOperationSchema = z.object({
  type: z.literal('add_npc_spawn'),
  roomRef: z.string().min(1),
  roomLabel: z.string(),
  npcTemplateId: z.number().int(),
  npcName: z.string(),
});

export const proposedOperationSchema = z.discriminatedUnion('type', [
  addRoomOperationSchema,
  addMobSpawnOperationSchema,
  addRoomItemOperationSchema,
  addNpcSpawnOperationSchema,
]);

export type AddRoomOperation = z.infer<typeof addRoomOperationSchema>;
export type AddMobSpawnOperation = z.infer<typeof addMobSpawnOperationSchema>;
export type AddRoomItemOperation = z.infer<typeof addRoomItemOperationSchema>;
export type AddNpcSpawnOperation = z.infer<typeof addNpcSpawnOperationSchema>;
export type ProposedOperation = z.infer<typeof proposedOperationSchema>;
