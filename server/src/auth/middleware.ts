import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/client.js';
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

export function requireBuilder(req: AuthedRequest, res: Response, next: NextFunction): void {
  const account = db.prepare('SELECT is_builder FROM accounts WHERE id = ?').get(req.accountId) as
    | { is_builder: number }
    | undefined;

  if (!account?.is_builder) {
    res.status(403).json({ error: '빌더 권한이 없습니다.' });
    return;
  }

  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const account = db.prepare('SELECT is_admin FROM accounts WHERE id = ?').get(req.accountId) as
    | { is_admin: number }
    | undefined;

  if (!account?.is_admin) {
    res.status(403).json({ error: '어드민 권한이 없습니다.' });
    return;
  }

  next();
}
