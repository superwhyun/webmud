import { z } from 'zod';
import { getAllSessions } from '../game/sessionRegistry.js';
import { send } from '../game/wsUtil.js';
import { adminRouter } from './router.js';

const announceSchema = z.object({
  message: z.string().min(1, '메시지를 입력하세요.').max(500, '메시지는 500자 이하여야 합니다.'),
});

adminRouter.post('/announce', (req, res) => {
  const parsed = announceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  for (const session of getAllSessions()) {
    send(session.ws, { type: 'text', text: `[공지] ${parsed.data.message}`, channel: 'admin' });
  }
  res.status(204).send();
});
