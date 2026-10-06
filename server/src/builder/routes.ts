import { Router } from 'express';
import { requireAuth, requireBuilder } from '../auth/middleware.js';
import { registerZonesRoutes } from './zones.js';
import { registerRoomsRoutes } from './rooms.js';
import { registerExitsRoutes } from './exits.js';
import { registerItemsRoutes } from './items.js';
import { registerMobsRoutes } from './mobs.js';
import { registerNpcsRoutes } from './npcs.js';
import { registerMapAssistantRoutesRoutes } from './mapAssistant/routes.js';
import { registerMapExportRoutes } from './mapExport.js';

export function createBuilderRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireBuilder);
  registerZonesRoutes(router);
  registerRoomsRoutes(router);
  registerExitsRoutes(router);
  registerItemsRoutes(router);
  registerMobsRoutes(router);
  registerNpcsRoutes(router);
  registerMapAssistantRoutesRoutes(router);
  registerMapExportRoutes(router);
  return router;
}
