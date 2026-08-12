import { z } from 'zod';
import { builderRouter } from '../router.js';
import { applyOperations } from './apply.js';
import { MAX_OPERATIONS } from './config.js';
import { proposedOperationSchema } from './operations.js';
import { proposeChanges } from './propose.js';

const proposeSchema = z.object({
  prompt: z.string().min(1, '프롬프트를 입력하세요.').max(2000, '프롬프트는 2000자 이하여야 합니다.'),
});

builderRouter.post('/zones/:zoneId/assistant/propose', async (req, res) => {
  const zoneId = Number(req.params.zoneId);
  const parsed = proposeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  try {
    const outcome = await proposeChanges(zoneId, parsed.data.prompt);
    if ('error' in outcome) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }
    res.json(outcome);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'AI 제안 생성 중 오류가 발생했습니다.' });
  }
});

const applySchema = z.object({
  operations: z.array(proposedOperationSchema).max(MAX_OPERATIONS),
});

builderRouter.post('/zones/:zoneId/assistant/apply', (req, res) => {
  const zoneId = Number(req.params.zoneId);
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  try {
    const results = applyOperations(zoneId, parsed.data.operations);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'AI 제안 적용 중 오류가 발생했습니다.' });
  }
});
