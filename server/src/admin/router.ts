import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth/middleware.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);
