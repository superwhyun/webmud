import type { Router } from 'express';
import { parseBody } from '../http/validation.js';
import { z } from 'zod';
import { deleteAppSetting, getAppSetting, OPENAI_API_KEY_SETTING_KEY, setAppSetting } from '../db/appSettings.js';

const setKeySchema = z.object({
  apiKey: z.string().min(1, 'API 키를 입력하세요.').max(200, 'API 키가 너무 깁니다.'),
});

export function registerSettingsRoutes(adminRouter: Router): void {
  adminRouter.get('/settings/openai-key', (_req, res) => {
    const value = getAppSetting(OPENAI_API_KEY_SETTING_KEY);
    res.json({ configured: Boolean(value) });
  });

  adminRouter.post('/settings/openai-key', (req, res) => {
    const parsed = parseBody(setKeySchema, req.body, res);
    if (!parsed) return;

    setAppSetting(OPENAI_API_KEY_SETTING_KEY, parsed.apiKey.trim());
    res.status(204).send();
  });

  adminRouter.delete('/settings/openai-key', (_req, res) => {
    deleteAppSetting(OPENAI_API_KEY_SETTING_KEY);
    res.status(204).send();
  });
}
