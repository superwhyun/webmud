import type { Router } from 'express';
import { parseBody } from '../http/validation.js';
import { z } from 'zod';
import { db } from '../db/client.js';
import { getAllSessions, getSessionByCharacterName } from '../game/sessionRegistry.js';
import { getRoom } from '../game/World.js';
import { forceMoveSession, kickSession } from './moderation.js';

const moveSchema = z.object({
  characterName: z.string().min(1, '캐릭터 이름을 입력하세요.'),
  targetRoomId: z.number().int(),
});

const kickSchema = z.object({
  characterName: z.string().min(1, '캐릭터 이름을 입력하세요.'),
  reason: z.string().max(200).optional(),
});

export function registerSessionsRoutes(adminRouter: Router): void {
  adminRouter.get('/sessions', (_req, res) => {
    const sessions = getAllSessions().map((session) => ({
      characterName: session.characterName,
      roomId: session.roomId,
      roomName: getRoom(session.roomId)?.name ?? '?',
    }));
    res.json({ sessions });
  });

  adminRouter.post('/moderation/move', (req, res) => {
    const parsed = parseBody(moveSchema, req.body, res);
    if (!parsed) return;

    const session = getSessionByCharacterName(parsed.characterName);
    if (!session) {
      res.status(404).json({ error: '온라인 상태가 아닙니다.' });
      return;
    }

    const result = forceMoveSession(session, parsed.targetRoomId);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }

    res.status(204).send();
  });

  adminRouter.post('/moderation/kick', (req, res) => {
    const parsed = parseBody(kickSchema, req.body, res);
    if (!parsed) return;

    const session = getSessionByCharacterName(parsed.characterName);
    if (!session) {
      res.status(404).json({ error: '온라인 상태가 아닙니다.' });
      return;
    }

    kickSession(session, parsed.reason);
    res.status(204).send();
  });

  adminRouter.get('/rooms', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT rooms.id as id, rooms.name as name, rooms.zone_id as zoneId, zones.name as zoneName
         FROM rooms JOIN zones ON zones.id = rooms.zone_id
         ORDER BY zones.id, rooms.name`,
      )
      .all() as { id: number; name: string; zoneId: number; zoneName: string }[];
    res.json({ rooms: rows });
  });
}
