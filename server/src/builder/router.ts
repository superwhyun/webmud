import { Router } from 'express';
import { requireAuth, requireBuilder } from '../auth/middleware.js';

export const builderRouter = Router();

builderRouter.use(requireAuth, requireBuilder);
