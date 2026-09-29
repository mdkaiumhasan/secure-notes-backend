import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Post } from '../models/Post';
import { User } from '../models/User';
import { userPostsPipeline } from '../pipelines';
import { HttpError, wrap } from '../utils/errors';
import { cursorFilter, cursorQuery, idParams, toPage, type CursorQuery } from '../utils/pagination';

const create = z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(5000) }).strict();

export const postsRouter = Router();

// Posts are public: anyone can read them.
postsRouter.get('/', validate(cursorQuery.strict(), 'query'), wrap(async (req, res) => {
  const q = req.query as unknown as CursorQuery;
  const rows = await Post.find(cursorFilter(q.cursor)).sort({ _id: -1 }).limit(q.limit + 1)
    .populate({ path: 'author', select: 'name' }).lean();
  res.json(toPage(rows, q.limit));
}));

// Scenario 2: one aggregation pipeline, one $lookup.
postsRouter.get('/by-user/:id', validate(idParams, 'params'), validate(cursorQuery.strict(), 'query'), wrap(async (req, res) => {
  const q = req.query as unknown as CursorQuery;
  const [result] = await User.aggregate(userPostsPipeline({ userId: String(req.params.id), cursor: q.cursor, limit: q.limit }));
  if (!result) throw new HttpError(404, 'User not found');
  res.json({ user: { _id: result._id, name: result.name }, ...toPage(result.posts as { _id: unknown }[], q.limit) });
}));

postsRouter.post('/', authenticate, validate(create), wrap(async (req, res) => {
  const post = await Post.create({ ...req.body, author: req.user!.id });
  res.status(201).json({ post });
}));

// Authors delete their own posts; admins can moderate any post.
postsRouter.delete('/:id', authenticate, validate(idParams, 'params'), wrap(async (req, res) => {
  const filter = req.user!.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, author: req.user!.id };
  const r = await Post.deleteOne(filter);
  if (r.deletedCount === 0) throw new HttpError(404, 'Post not found');
  res.status(204).end();
}));
