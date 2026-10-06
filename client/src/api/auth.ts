import type { CharacterDto, ElementType, JobType, MeResponse } from '@mud/shared';
import { apiRequest, authenticatedRequest } from './transport';

export function register(username: string, password: string): Promise<{ token: string }> {
  return apiRequest('/register', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return apiRequest('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function fetchMe(token: string): Promise<MeResponse> {
  return authenticatedRequest(token, '/me');
}

export function createCharacter(
  token: string,
  name: string,
  element: ElementType,
  job: JobType,
): Promise<{ character: CharacterDto }> {
  return authenticatedRequest(token, '/character', 'POST', { name, element, job });
}
