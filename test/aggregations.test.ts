import './setup';
import { describe, expect, it } from 'vitest';
import { Post } from '../src/models/Post';
import { User } from '../src/models/User';
import { interestsPipeline, userPostsPipeline } from '../src/pipelines';
import { hashPassword } from '../src/utils/password';

describe('Scenario 1: group users by interest', () => {
  it('groups correctly using a single aggregate() call', async () => {
    const hash = await hashPassword('CorrectHorse123');
    await User.create([
      { name: 'A', email: 'a1@example.com', passwordHash: hash, interests: ['chess', 'reading'] },
      { name: 'B', email: 'b1@example.com', passwordHash: hash, interests: ['chess'] },
      { name: 'C', email: 'c1@example.com', passwordHash: hash, interests: [] },
    ]);
    const rows = await User.aggregate(interestsPipeline({ page: 1, limit: 20 }));
    const chess = rows.find((r) => r.interest === 'chess');
    expect(chess.count).toBe(2);
    expect(rows.find((r) => r.interest === 'reading').count).toBe(1);
  });
});

describe('Scenario 2: user posts via $lookup', () => {
  it('returns only the given user\'s posts, newest first', async () => {
    const hash = await hashPassword('CorrectHorse123');
    const [alice, bob] = await User.create([
      { name: 'Alice', email: 'alice9@example.com', passwordHash: hash },
      { name: 'Bob', email: 'bob9@example.com', passwordHash: hash },
    ]);
    await Post.create({ author: alice._id, title: 'First', body: '...' });
    await Post.create({ author: alice._id, title: 'Second', body: '...' });
    await Post.create({ author: bob._id, title: "Bob's post", body: '...' });

    const [result] = await User.aggregate(userPostsPipeline({ userId: String(alice._id), limit: 20 }));
    expect(result.posts).toHaveLength(2);
    expect(result.posts.map((p: any) => p.title)).toEqual(['Second', 'First']);
  });
});
