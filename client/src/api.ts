// Compatibility entry point; feature code lives in api/.
export type { CharacterDto, MeResponse } from '@mud/shared';
export { apiRequest, authHeader } from './api/transport';
export * from './api/auth';
