import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET ?? randomBytes(32).toString('hex');

if (!process.env.JWT_SECRET) {
  console.warn(
    '[auth] JWT_SECRET not set; using an ephemeral secret. Existing sessions will be invalidated on restart. Set JWT_SECRET in production.',
  );
}

export interface TokenPayload {
  accountId: number;
  username: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, secret) as TokenPayload;
  } catch {
    return null;
  }
}
