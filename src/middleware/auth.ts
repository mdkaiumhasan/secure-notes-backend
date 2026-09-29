import type { RequestHandler } from 'express';
import { User, type Role } from '../models/User';
import { HttpError, wrap } from '../utils/errors';
import { ACCESS_COOKIE, verifyToken } from '../utils/tokens';

declare module 'express-serve-static-core' {
  interface Request { user?: { id: string; role: Role } }
}

/**
 * Verifies the access cookie, then re-reads the user (by _id, indexed) so that deleted users,
 * role changes and revoked sessions (tokenVersion) take effect immediately, not at token expiry.
 * The role is taken from the database, never from the token.
 */
export const authenticate: RequestHandler = wrap(async (req, _res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (typeof token !== 'string') throw new HttpError(401, 'Authentication required');
  let payload;
  try { payload = verifyToken('access', token); } catch { throw new HttpError(401, 'Invalid or expired session'); }
  const user = await User.findById(payload.sub).select('role +tokenVersion').lean();
  if (!user || user.tokenVersion !== payload.tv) throw new HttpError(401, 'Invalid or expired session');
  req.user = { id: String(user._id), role: user.role as Role };
  next();
});

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) =>
    req.user && roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to do that'));
