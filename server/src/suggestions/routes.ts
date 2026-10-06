import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { registerSuggestionsRoutes } from './suggestions.js';

export function createSuggestionsRouter(): Router {
  const router = Router();
  router.use(requireAuth);
  registerSuggestionsRoutes(router);
  return router;
}
