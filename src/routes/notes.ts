import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Note } from '../models/Note';
import { HttpError, wrap } from '../utils/errors';
import { cursorFilter, cursorQuery, idParams, objectIdStr, toPage, type CursorQuery } from '../utils/pagination';

const create = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().max(10000).default(''),
}).strict();
const update = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().max(10000).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const allQuery = cursorQuery.extend({ owner: objectIdStr.optional() }).strict();

export const notesRouter = Router();
notesRouter.use(authenticate);

// Own notes (every role, admins included).
notesRouter.get('/', validate(cursorQuery.strict(), 'query'), wrap(async (req, res) => {
  const q = req.query as unknown as CursorQuery;
  const rows = await Note.find({ owner: req.user!.id, ...cursorFilter(q.cursor) })
    .sort({ _id: -1 }).limit(q.limit + 1).lean();
  res.json(toPage(rows, q.limit));
}));

// Admin: everyone's notes, optionally narrowed to one owner.
notesRouter.get('/all', requireRole('admin'), validate(allQuery, 'query'), wrap(async (req, res) => {
  const q = req.query as unknown as CursorQuery & { owner?: string };
  const rows = await Note.find({ ...(q.owner ? { owner: q.owner } : {}), ...cursorFilter(q.cursor) })
    .sort({ _id: -1 }).limit(q.limit + 1).populate({ path: 'owner', select: 'name email' }).lean();
  res.json(toPage(rows, q.limit));
}));

notesRouter.post('/', validate(create), wrap(async (req, res) => {
  const note = await Note.create({ ...req.body, owner: req.user!.id });
  res.status(201).json({ note });
}));

// Ownership is part of the query itself (not a check after fetching), so there is no IDOR window.
// Admins may read any note; write access is always owner-only. 404 (not 403) avoids confirming existence.
notesRouter.get('/:id', validate(idParams, 'params'), wrap(async (req, res) => {
  const filter = req.user!.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, owner: req.user!.id };
  const note = await Note.findOne(filter).lean();
  if (!note) throw new HttpError(404, 'Note not found');
  res.json({ note });
}));

notesRouter.patch('/:id', validate(idParams, 'params'), validate(update), wrap(async (req, res) => {
  const note = await Note.findOneAndUpdate({ _id: req.params.id, owner: req.user!.id }, { $set: req.body }, { new: true, runValidators: true }).lean();
  if (!note) throw new HttpError(404, 'Note not found');
  res.json({ note });
}));

notesRouter.delete('/:id', validate(idParams, 'params'), wrap(async (req, res) => {
  const r = await Note.deleteOne({ _id: req.params.id, owner: req.user!.id });
  if (r.deletedCount === 0) throw new HttpError(404, 'Note not found');
  res.status(204).end();
}));
