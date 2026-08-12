import { apiRequest, authHeader } from './api';

export interface SuggestionDto {
  id: number;
  authorName: string;
  title: string;
  content: string;
  createdAt: string;
  upCount: number;
  downCount: number;
  myVote: 'up' | 'down' | null;
  isOwner: boolean;
}

export interface SuggestionPageDto {
  suggestions: SuggestionDto[];
  total: number;
  page: number;
  pageSize: number;
}

export function fetchSuggestions(token: string, page: number): Promise<SuggestionPageDto> {
  return apiRequest(`/suggestions?page=${page}`, { headers: authHeader(token) });
}

export function createSuggestion(token: string, title: string, content: string): Promise<{ suggestion: SuggestionDto }> {
  return apiRequest('/suggestions', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ title, content }),
  });
}

export function updateSuggestion(
  token: string,
  id: number,
  title: string,
  content: string,
): Promise<{ suggestion: SuggestionDto }> {
  return apiRequest(`/suggestions/${id}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ title, content }),
  });
}

export function deleteSuggestion(token: string, id: number): Promise<void> {
  return apiRequest(`/suggestions/${id}`, { method: 'DELETE', headers: authHeader(token) });
}

export function voteSuggestion(token: string, id: number, vote: 'up' | 'down'): Promise<{ suggestion: SuggestionDto }> {
  return apiRequest(`/suggestions/${id}/vote`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ vote }),
  });
}
