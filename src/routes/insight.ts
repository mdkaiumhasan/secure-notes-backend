import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { interestsPipeline, userPostsPipeline } from '../pipelines';
import { wrap } from '../utils/errors';
import { Note } from '../models/Note';
import { Post } from '../models/Post';
import { User } from '../models/User';

/**
 * Admin-only diagnostics: runs each list/aggregation query through explain('executionStats') so the
 * indexing strategy can be verified live instead of taken on faith. Read-only, admin-gated, and each
 * query mirrors exactly what its real route runs.
 */
export const insightRouter = Router();
insightRouter.use(requireRole('admin'));

const summarize = (stats: any) => ({
  indexUsed: stats.executionStages?.indexName ?? stats.executionStages?.inputStage?.indexName ?? null,
  stage: stats.executionStages?.stage,
  docsExamined: stats.totalDocsExamined,
  keysExamined: stats.totalKeysExamined,
  nReturned: stats.nReturned,
  millis: stats.executionTimeMillis,
});

const ZERO_ID = '000000000000000000000000';

insightRouter.get('/', wrap(async (_req, res) => {
  const [myNotes, allNotes, allUsers]: any[] = await Promise.all([
    Note.find({ owner: ZERO_ID }).sort({ _id: -1 }).limit(20).explain('executionStats'),
    Note.find({}).sort({ _id: -1 }).limit(20).explain('executionStats'),
    User.find({}).sort({ _id: -1 }).limit(20).explain('executionStats'),
  ]);
  const queries: any[] = [
    { name: 'GET /api/notes (my notes: owner + _id desc)', index: '{ owner: 1, _id: -1 }', ...summarize(myNotes.executionStats) },
    { name: 'GET /api/notes/all (admin, all notes)', index: '_id (default)', ...summarize(allNotes.executionStats) },
    { name: 'GET /api/users (admin, all users)', index: '_id (default)', ...summarize(allUsers.executionStats) },
  ];

  // Aggregation explain() has a different shape (per-stage plans, no single executionStats root),
  // so it's surfaced as raw explain output rather than forced into the same summary shape.
  try {
    const interestsExplain = await User.aggregate(interestsPipeline({ page: 1, limit: 20 })).explain('executionStats');
    queries.push({ name: 'GET /api/users/by-interest (Scenario 1, single aggregate() call)', index: '{ interests: 1 }', stage: 'aggregation', raw: interestsExplain } as any);
  } catch (e) { queries.push({ name: 'GET /api/users/by-interest', error: String(e) } as any); }

  try {
    const postsExplain = await User.aggregate(userPostsPipeline({ userId: ZERO_ID, limit: 20 })).explain('executionStats');
    queries.push({ name: 'GET /api/posts/by-user/:id (Scenario 2, $lookup)', index: '{ author: 1, _id: -1 }', stage: 'aggregation', raw: postsExplain } as any);
  } catch (e) { queries.push({ name: 'GET /api/posts/by-user/:id', error: String(e) } as any); }

  res.json({ queries });
}));
