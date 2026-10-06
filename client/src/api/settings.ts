import { authenticatedRequest } from './transport';

export function fetchOpenAiKeyStatus(token: string): Promise<{ configured: boolean }> {
  return authenticatedRequest(token, '/admin/settings/openai-key');
}

export function saveOpenAiKey(token: string, apiKey: string): Promise<void> {
  return authenticatedRequest(token, '/admin/settings/openai-key', 'POST', { apiKey });
}

export function clearOpenAiKey(token: string): Promise<void> {
  return authenticatedRequest(token, '/admin/settings/openai-key', 'DELETE');
}
