import type { Router } from 'express';
import { parseBody } from '../../http/validation.js';
import { z } from 'zod';
import { applyOperations } from './apply.js';
import { MAX_OPERATIONS } from './config.js';
import { proposedOperationSchema } from './operations.js';
import { proposeChanges } from './propose.js';

const proposeSchema = z.object({
  prompt: z.string().min(1, '프롬프트를 입력하세요.').max(2000, '프롬프트는 2000자 이하여야 합니다.'),
});

const applySchema = z.object({
  operations: z.array(proposedOperationSchema).max(MAX_OPERATIONS),
});

export function registerMapAssistantRoutesRoutes(builderRouter: Router): void {
  builderRouter.post('/zones/:zoneId/assistant/propose', async (req, res) => {
    const zoneId = Number(req.params.zoneId);
    const parsed = parseBody(proposeSchema, req.body, res);
    if (!parsed) return;

    try {
      const outcome = await proposeChanges(zoneId, parsed.prompt);
      if ('error' in outcome) {
        res.status(outcome.status).json({ error: outcome.error });
        return;
      }
      res.json(outcome);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'AI 제안 생성 중 오류가 발생했습니다.' });
    }
  });

  builderRouter.post('/zones/:zoneId/assistant/apply', (req, res) => {
    const zoneId = Number(req.params.zoneId);
    const parsed = parseBody(applySchema, req.body, res);
    if (!parsed) return;

    try {
      const results = applyOperations(zoneId, parsed.operations);
      res.json({ results });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'AI 제안 적용 중 오류가 발생했습니다.' });
    }
  });
}
