import OpenAI from 'openai';
import { getAppSetting, OPENAI_API_KEY_SETTING_KEY } from '../../db/appSettings.js';

/** Override with OPENAI_MODEL if a different Responses-API-capable model is preferred. */
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1';

export const MAX_TOOL_CALL_ITERATIONS = 20;
export const MAX_OPERATIONS = 30;

/** Prefers the key set via the admin "AI 설정" screen; falls back to the OPENAI_API_KEY env var for
 * ops-managed deployments that prefer configuring secrets outside the DB. */
export function getOpenAiClient(): OpenAI {
  const apiKey = getAppSetting(OPENAI_API_KEY_SETTING_KEY) || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다. 관리자 화면의 AI 설정 탭에서 입력하세요.');
  }
  return new OpenAI({ apiKey });
}
