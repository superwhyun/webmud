import type { MapAssistantApplyResult, MapAssistantOperation, MapAssistantProposeResult } from '@mud/shared';
import { authenticatedRequest } from './transport';

export function proposeMapAssistantChanges(token: string, zoneId: number, prompt: string): Promise<MapAssistantProposeResult> {
  return authenticatedRequest(token, `/builder/zones/${zoneId}/assistant/propose`, 'POST', { prompt });
}

export function applyMapAssistantChanges(
  token: string,
  zoneId: number,
  operations: MapAssistantOperation[],
): Promise<MapAssistantApplyResult> {
  return authenticatedRequest(token, `/builder/zones/${zoneId}/assistant/apply`, 'POST', { operations });
}
