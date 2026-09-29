import { Types } from 'mongoose';
import { z } from 'zod';

export const objectIdStr = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
export const idParams = z.object({ id: objectIdStr }).strict();

export const cursorQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: objectIdStr.optional(),
});
export type CursorQuery = z.infer<typeof cursorQuery>;

/** `{ _id: { $lt: cursor } }` fragment, or nothing for the first page. */
export const cursorFilter = (cursor?: string) => (cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {});

/**
 * Keyset (cursor) pagination on _id. Newest first. Because _id is always indexed and ObjectIds are
 * roughly time-ordered, no extra index or createdAt sort is needed, and deep pages stay O(limit).
 * Callers fetch `limit + 1` rows; the extra row only signals that another page exists.
 */
export function toPage<T extends { _id: unknown }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? String(items[items.length - 1]!._id) : null };
}
