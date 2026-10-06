import express from 'express';
import { createAdminRouter } from './admin/routes.js';
import { createAuthRouter } from './auth/routes.js';
import { createBuilderRouter } from './builder/routes.js';
import { createSuggestionsRouter } from './suggestions/routes.js';

/** Compose HTTP features without starting sockets, timers, or listening ports. */
export function createApplication(): express.Express {
  const app = express();
  // Full map imports need larger bodies; other endpoints retain the default limit.
  app.use('/api/builder', express.json({ limit: '10mb' }));
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', createAuthRouter());
  app.use('/api/builder', createBuilderRouter());
  app.use('/api/admin', createAdminRouter());
  app.use('/api/suggestions', createSuggestionsRouter());
  return app;
}
