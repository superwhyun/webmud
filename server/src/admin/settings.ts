import { z } from 'zod';
import { deleteAppSetting, getAppSetting, OPENAI_API_KEY_SETTING_KEY, setAppSetting } from '../db/appSettings.js';
import { adminRouter } from './router.js';

/** Never echoes the stored key back — only whether one is currently configured. */
adminRouter.get('/settings/openai-key', (_req, res) => {
  const value = getAppSetting(OPENAI_API_KEY_SETTING_KEY);
  res.json({ configured: Boolean(value) });
});

const setKeySchema = z.object({
  apiKey: z.string().min(1, 'API 키를 입력하세요.').max(200, 'API 키가 너무 깁니다.'),
});

adminRouter.post('/settings/openai-key', (req, res) => {
  const parsed = setKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  setAppSetting(OPENAI_API_KEY_SETTING_KEY, parsed.data.apiKey.trim());
  res.status(204).send();
});

adminRouter.delete('/settings/openai-key', (_req, res) => {
  deleteAppSetting(OPENAI_API_KEY_SETTING_KEY);
  res.status(204).send();
});
