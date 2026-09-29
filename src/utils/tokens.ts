import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
const ISSUER = 'secure-notes-api';

type Kind = 'access' | 'refresh';
export interface TokenPayload { sub: string; tv: number; typ: Kind }

const secretFor = (k: Kind) => (k === 'access' ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET);

export function signToken(kind: Kind, userId: string, tokenVersion: number): string {
  return jwt.sign({ tv: tokenVersion, typ: kind }, secretFor(kind), {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    expiresIn: kind === 'access' ? config.accessTtlSeconds : config.refreshTtlSeconds,
  });
}

/** Algorithm is pinned (no "alg: none" / algorithm confusion) and the token type is enforced. */
export function verifyToken(kind: Kind, token: string): TokenPayload {
  const p = jwt.verify(token, secretFor(kind), { algorithms: ['HS256'], issuer: ISSUER });
  if (typeof p === 'string' || p.typ !== kind || typeof p.sub !== 'string' || typeof p.tv !== 'number') {
    throw new Error('Malformed token');
  }
  return { sub: p.sub, tv: p.tv, typ: kind };
}

const cookieBase = { httpOnly: true, secure: config.isProd, sameSite: 'lax' as const };

export function setAuthCookies(res: Response, userId: string, tokenVersion: number): void {
  res.cookie(ACCESS_COOKIE, signToken('access', userId, tokenVersion), {
    ...cookieBase, path: '/', maxAge: config.accessTtlSeconds * 1000,
  });
  // The refresh cookie is only ever sent to the auth endpoints.
  res.cookie(REFRESH_COOKIE, signToken('refresh', userId, tokenVersion), {
    ...cookieBase, path: '/api/auth', maxAge: config.refreshTtlSeconds * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase, path: '/api/auth' });
}
