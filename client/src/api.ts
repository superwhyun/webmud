import type { ElementType, JobType } from '@mud/shared';

export interface CharacterDto {
  id: number;
  name: string;
  room_id: number;
  room_name: string;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  level: number;
  exp: number;
  job: JobType | null;
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  wisdom: number;
  luck: number;
  physical_defense: number;
  magic_defense: number;
  element: ElementType;
  gold: number;
  unallocated_stat_points: number;
  unallocated_skill_points: number;
}

export interface MeResponse {
  username: string;
  character: CharacterDto | null;
  isBuilder: boolean;
  isAdmin: boolean;
}

interface ErrorResponse {
  error?: string;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const text = await response.text();
  if (!text) {
    if (!response.ok) {
      throw new Error(`요청에 실패했습니다. (상태 코드: ${response.status})`);
    }
    return undefined as T;
  }
  let body: T & ErrorResponse;
  try {
    body = JSON.parse(text) as T & ErrorResponse;
  } catch {
    if (!response.ok) {
      throw new Error(`서버와 통신할 수 없습니다. (상태 코드: ${response.status})`);
    }
    throw new Error('서버 응답을 처리하지 못했습니다.');
  }
  if (!response.ok) {
    throw new Error(body.error ?? '요청에 실패했습니다.');
  }
  return body;
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function register(username: string, password: string): Promise<{ token: string }> {
  return apiRequest('/register', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return apiRequest('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function fetchMe(token: string): Promise<MeResponse> {
  return apiRequest('/me', { headers: authHeader(token) });
}

export function createCharacter(
  token: string,
  name: string,
  element: ElementType,
  job: JobType,
): Promise<{ character: CharacterDto }> {
  return apiRequest('/character', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ name, element, job }),
  });
}
