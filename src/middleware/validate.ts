import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { HttpError } from '../utils/errors';

/** Validates and replaces req[source] with the parsed value. Schemas are .strict(): unknown keys are rejected. */
export const validate =
  (schema: ZodTypeAny, source: 'body' | 'query' | 'params' = 'body'): RequestHandler =>
  (req, _res, next) => {
    const r = schema.safeParse(req[source]);
    if (!r.success) return next(new HttpError(400, 'Validation failed', r.error.flatten().fieldErrors));
    (req as unknown as Record<string, unknown>)[source] = r.data;
    next();
  };
