import type { Router } from 'express';
import { parseBody } from '../http/validation.js';
import { z } from 'zod';
import { getAllSessions } from '../game/sessionRegistry.js';
import { send } from '../game/wsUtil.js';

const announceSchema = z.object({
  message: z.string().min(1, '메시지를 입력하세요.').max(500, '메시지는 500자 이하여야 합니다.'),
});

export function registerAnnounceRoutes(adminRouter: Router): void {
  adminRouter.post('/announce', (req, res) => {
    const parsed = parseBody(announceSchema, req.body, res);
    if (!parsed) return;

    for (const session of getAllSessions()) {
      send(session.ws, { type: 'text', text: `[공지] ${parsed.message}`, channel: 'admin' });
    }
    res.status(204).send();
  });
}
