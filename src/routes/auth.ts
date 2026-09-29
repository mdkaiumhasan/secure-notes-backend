import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/security';
import { validate } from '../middleware/validate';
import { User } from '../models/User';
import { HttpError, wrap } from '../utils/errors';
import { hashPassword, verifyPassword } from '../utils/password';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies, verifyToken } from '../utils/tokens';

export const password = z.string().min(10, 'Use at least 10 characters').max(128);
const email = z.string().trim().toLowerCase().email().max(254);

const registerBody = z.object({ name: z.string().trim().min(1).max(80), email, password }).strict();
const loginBody = z.object({ email, password: z.string().min(1).max(128) }).strict();

export const authRouter = Router();

// Self-registration can only ever create role "user" (strict schema rejects a "role" field).
authRouter.post('/register', authLimiter, validate(registerBody), wrap(async (req, res) => {
  const { name, email, password } = req.body;
  const user = await User.create({ name, email, passwordHash: await hashPassword(password), role: 'user' });
  setAuthCookies(res, String(user._id), 0);
  res.status(201).json({ user });
}));

authRouter.post('/login', authLimiter, validate(loginBody), wrap(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash +tokenVersion');
  const ok = await verifyPassword(user?.passwordHash, req.body.password);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password'); // same message either way
  setAuthCookies(res, String(user._id), user.tokenVersion);
  res.json({ user });
}));

authRouter.post('/refresh', wrap(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== 'string') throw new HttpError(401, 'No session');
  let payload;
  try { payload = verifyToken('refresh', token); } catch { throw new HttpError(401, 'Invalid or expired session'); }
  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || user.tokenVersion !== payload.tv) { clearAuthCookies(res); throw new HttpError(401, 'Invalid or expired session'); }
  setAuthCookies(res, String(user._id), user.tokenVersion); // rotates both cookies
  res.json({ user });
}));

authRouter.post('/logout', (_req, res) => { clearAuthCookies(res); res.status(204).end(); });

// Revokes every session on every device.
authRouter.post('/logout-all', authenticate, wrap(async (req, res) => {
  await User.updateOne({ _id: req.user!.id }, { $inc: { tokenVersion: 1 } });
  clearAuthCookies(res);
  res.status(204).end();
}));

authRouter.get('/me', authenticate, wrap(async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new HttpError(401, 'Invalid or expired session');
  res.json({ user });
}));
