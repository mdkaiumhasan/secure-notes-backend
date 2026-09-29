import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { HttpError } from '../utils/errors';

/**
 * CSRF defence in depth (on top of SameSite=Lax cookies): every state-changing request must carry a
 * custom header (cross-site forms cannot set it; cross-site fetch triggers a CORS preflight that our
 * allowlist rejects) and, when the browser sends an Origin, it must be on the allowlist.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'XMLHttpRequest') return next(new HttpError(403, 'Missing X-Requested-With header'));
  const origin = req.get('origin');
  if (origin && !config.clientOrigins.includes(origin)) return next(new HttpError(403, 'Origin not allowed'));
  next();
};

export const apiLimiter = rateLimit({
  windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { message: 'Too many requests, slow down' } },
});

// Only failed attempts count, so legitimate users are never locked out by their own successful logins.
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 20, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { message: 'Too many failed attempts. Try again in 15 minutes.' } },
});
