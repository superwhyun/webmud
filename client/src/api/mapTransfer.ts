import type { MapExportPayload } from '@mud/shared';
import { authenticatedRequest } from './transport';

export function fetchMapExport(token: string): Promise<MapExportPayload> {
  return authenticatedRequest(token, '/builder/map-export');
}

export function importMapExport(token: string, payload: MapExportPayload): Promise<{ ok: true }> {
  return authenticatedRequest(token, '/builder/map-import', 'POST', payload);
}
