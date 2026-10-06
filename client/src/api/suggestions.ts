import type { SuggestionDto, SuggestionPageDto } from '@mud/shared';
import { authenticatedRequest } from './transport';

export function fetchSuggestions(token: string, page: number): Promise<SuggestionPageDto> {
  return authenticatedRequest(token, `/suggestions?page=${page}`);
}

export function createSuggestion(token: string, title: string, content: string): Promise<{ suggestion: SuggestionDto }> {
  return authenticatedRequest(token, '/suggestions', 'POST', { title, content });
}

export function updateSuggestion(
  token: string,
  id: number,
  title: string,
  content: string,
): Promise<{ suggestion: SuggestionDto }> {
  return authenticatedRequest(token, `/suggestions/${id}`, 'PATCH', { title, content });
}

export function deleteSuggestion(token: string, id: number): Promise<void> {
  return authenticatedRequest(token, `/suggestions/${id}`, 'DELETE');
}

export function voteSuggestion(token: string, id: number, vote: 'up' | 'down'): Promise<{ suggestion: SuggestionDto }> {
  return authenticatedRequest(token, `/suggestions/${id}/vote`, 'POST', { vote });
}
