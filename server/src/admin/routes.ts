import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { registerAccountsRoutes } from './accounts.js';
import { registerSessionsRoutes } from './sessions.js';
import { registerAnnounceRoutes } from './announce.js';
import { registerItemsRoutes } from './items.js';
import { registerMobsRoutes } from './mobs.js';
import { registerNpcsRoutes } from './npcs.js';
import { registerContentTransferRoutes } from './contentTransfer.js';
import { registerSettingsRoutes } from './settings.js';

export function createAdminRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireAdmin);
  registerAccountsRoutes(router);
  registerSessionsRoutes(router);
  registerAnnounceRoutes(router);
  registerItemsRoutes(router);
  registerMobsRoutes(router);
  registerNpcsRoutes(router);
  registerContentTransferRoutes(router);
  registerSettingsRoutes(router);
  return router;
}
