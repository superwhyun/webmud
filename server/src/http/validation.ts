import type { Response } from 'express';
import type { z } from 'zod';

/** All HTTP domains use the same validation response, while retaining feature messages. */
export function parseBody<T extends object>(schema: z.ZodType<T>, body: unknown, response: Response, fallback = 'Invalid input'): T | undefined {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? fallback });
    return undefined;
  }
  return parsed.data;
}
