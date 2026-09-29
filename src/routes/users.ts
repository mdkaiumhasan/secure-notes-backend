import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { interestsPipeline } from '../pipelines';
import { HttpError, wrap } from '../utils/errors';
import { cursorFilter, cursorQuery, idParams, toPage, type CursorQuery } from '../utils/pagination';
import { password as passwordSchema } from './auth';
import { Note } from '../models/Note';
import { Post } from '../models/Post';
import { ROLES, User } from '../models/User';
import { hashPassword } from '../utils/password';

const email = z.string().trim().toLowerCase().email().max(254);
const createBody = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password: passwordSchema,
  role: z.enum(ROLES).default('user'),
  interests: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
}).strict();
const updateBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(ROLES).optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const interestsQuery = z.object({
  interest: z.string().trim().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const usersRouter = Router();
usersRouter.use(authenticate, requireRole('admin'));

usersRouter.get('/', validate(cursorQuery.strict(), 'query'), wrap(async (req, res) => {
  const q = req.query as unknown as CursorQuery;
  const rows = await User.find(cursorFilter(q.cursor)).sort({ _id: -1 }).limit(q.limit + 1).lean();
  res.json(toPage(rows, q.limit));
}));

// Scenario 1: users grouped by interest - exactly one User.aggregate() call.
usersRouter.get('/by-interest', validate(interestsQuery, 'query'), wrap(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof interestsQuery>;
  const rows = await User.aggregate(interestsPipeline(q));
  res.json(toPage(rows, q.limit));
}));

usersRouter.post('/', validate(createBody), wrap(async (req, res) => {
  const { name, email, password, role, interests } = req.body;
  const user = await User.create({ name, email, passwordHash: await hashPassword(password), role, interests });
  res.status(201).json({ user });
}));

usersRouter.get('/:id', validate(idParams, 'params'), wrap(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user });
}));

usersRouter.patch('/:id', validate(idParams, 'params'), validate(updateBody), wrap(async (req, res) => {
  const target = await User.findById(req.params.id).select('+tokenVersion');
  if (!target) throw new HttpError(404, 'User not found');
  // An admin can't demote themself or the last remaining admin - the app can never lock itself out.
  if (req.body.role === 'user' && target.role === 'admin') {
    if (String(target._id) === req.user!.id) throw new HttpError(400, "You can't demote yourself");
    const otherAdmins = await User.countDocuments({ role: 'admin', _id: { $ne: target._id } });
    if (otherAdmins === 0) throw new HttpError(400, 'At least one admin must remain');
  }
  Object.assign(target, req.body);
  if (req.body.role) target.tokenVersion += 1; // role change invalidates existing sessions
  await target.save();
  res.json({ user: target });
}));

usersRouter.delete('/:id', validate(idParams, 'params'), wrap(async (req, res) => {
  if (req.params.id === req.user!.id) throw new HttpError(400, "You can't delete your own account");
  const target = await User.findById(req.params.id);
  if (!target) throw new HttpError(404, 'User not found');
  if (target.role === 'admin') {
    const otherAdmins = await User.countDocuments({ role: 'admin', _id: { $ne: target._id } });
    if (otherAdmins === 0) throw new HttpError(400, 'At least one admin must remain');
  }
  // Cascade delete so no orphaned notes/posts are left behind (and no note IDOR surface via a dangling owner).
  await Promise.all([User.deleteOne({ _id: target._id }), Note.deleteMany({ owner: target._id }), Post.deleteMany({ author: target._id })]);
  res.status(204).end();
}));
