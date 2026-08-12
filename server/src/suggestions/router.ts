import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';

export const suggestionsRouter = Router();

suggestionsRouter.use(requireAuth);
