import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from './jwt.js';

export interface AuthedRequest extends Request {
  accountId?: number;
  username?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.accountId = payload.accountId;
  req.username = payload.username;
  next();
}
