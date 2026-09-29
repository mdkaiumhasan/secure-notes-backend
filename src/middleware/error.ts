import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { config } from '../config';
import { HttpError } from '../utils/errors';

export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, 'Not found'));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof HttpError) ({ status, message, details } = err);
  else if (err instanceof ZodError) { status = 400; message = 'Validation failed'; details = err.flatten().fieldErrors; }
  else if (err?.code === 11000) { status = 409; message = 'That email is already registered'; }
  else if (err?.name === 'CastError') { status = 400; message = 'Invalid identifier'; }
  else if (err?.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON body'; }
  else if (err?.type === 'entity.too.large') { status = 413; message = 'Request body too large'; }

  if (status >= 500) console.error(err); // never leak internals to the client
  else if (!config.isProd && config.NODE_ENV !== 'test') console.warn(status, message);
  res.status(status).json({ error: { message, ...(details ? { details } : {}) } });
};
