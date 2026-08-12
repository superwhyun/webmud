import OpenAI from 'openai';

/** Override with OPENAI_MODEL if a different Responses-API-capable model is preferred. */
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1';

export const MAX_TOOL_CALL_ITERATIONS = 20;
export const MAX_OPERATIONS = 30;

export function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }
  return new OpenAI({ apiKey });
}
