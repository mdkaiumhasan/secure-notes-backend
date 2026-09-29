import { Types, type PipelineStage } from 'mongoose';

/**
 * Scenario 1 - users grouped by interest. Executed with exactly one User.aggregate() call.
 * Stage 1 is an index-friendly $match on the multikey index { interests: 1 }:
 *   - with a filter: equality on one interest
 *   - without: `$gt: ''` is a bounded scan over all string keys (skips users with no interests)
 */
export function interestsPipeline(o: { interest?: string; page: number; limit: number }): PipelineStage[] {
  return [
    { $match: o.interest ? { interests: o.interest } : { interests: { $gt: '' } } },
    { $unwind: '$interests' },
    ...(o.interest ? [{ $match: { interests: o.interest } } as PipelineStage] : []),
    {
      $group: {
        _id: '$interests',
        count: { $sum: 1 },
        users: { $firstN: { input: { _id: '$_id', name: '$name' }, n: 20 } },
      },
    } as unknown as PipelineStage,
    { $sort: { count: -1, _id: 1 } },
    { $skip: (o.page - 1) * o.limit },
    { $limit: o.limit + 1 },
    { $project: { _id: 0, interest: '$_id', count: 1, users: 1 } },
  ];
}

/**
 * Scenario 2 - all posts of one user via a single pipeline with $lookup.
 * The sub-pipeline's $match on author uses { author: 1, _id: -1 }, which also serves the sort + limit.
 */
export function userPostsPipeline(o: { userId: string; cursor?: string; limit: number }): PipelineStage[] {
  const subPipeline: Record<string, unknown>[] = [
    { $match: { $expr: { $eq: ['$author', '$$uid'] } } },
    ...(o.cursor ? [{ $match: { _id: { $lt: new Types.ObjectId(o.cursor) } } }] : []),
    { $sort: { _id: -1 } },
    { $limit: o.limit + 1 },
    { $project: { title: 1, body: 1, createdAt: 1 } },
  ];
  return [
    { $match: { _id: new Types.ObjectId(o.userId) } },
    { $project: { name: 1 } },
    { $lookup: { from: 'posts', let: { uid: '$_id' }, pipeline: subPipeline, as: 'posts' } },
  ] as PipelineStage[];
}
