import { z } from 'zod';
import { db } from '../db/client.js';
import { getAllSessions, getSessionByCharacterName } from '../game/sessionRegistry.js';
import { getRoom } from '../game/World.js';
import { forceMoveSession, kickSession } from './moderation.js';
import { adminRouter } from './router.js';

adminRouter.get('/sessions', (_req, res) => {
  const sessions = getAllSessions().map((session) => ({
    characterName: session.characterName,
    roomId: session.roomId,
    roomName: getRoom(session.roomId)?.name ?? '?',
  }));
  res.json({ sessions });
});

const moveSchema = z.object({
  characterName: z.string().min(1, '캐릭터 이름을 입력하세요.'),
  targetRoomId: z.number().int(),
});

adminRouter.post('/moderation/move', (req, res) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const session = getSessionByCharacterName(parsed.data.characterName);
  if (!session) {
    res.status(404).json({ error: '온라인 상태가 아닙니다.' });
    return;
  }

  const result = forceMoveSession(session, parsed.data.targetRoomId);
  if (!result.ok) {
    res.status(409).json({ error: result.error });
    return;
  }

  res.status(204).send();
});

const kickSchema = z.object({
  characterName: z.string().min(1, '캐릭터 이름을 입력하세요.'),
  reason: z.string().max(200).optional(),
});

adminRouter.post('/moderation/kick', (req, res) => {
  const parsed = kickSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const session = getSessionByCharacterName(parsed.data.characterName);
  if (!session) {
    res.status(404).json({ error: '온라인 상태가 아닙니다.' });
    return;
  }

  kickSession(session, parsed.data.reason);
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
