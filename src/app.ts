import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, notFound } from './middleware/error';
import { csrfGuard, apiLimiter } from './middleware/security';
import { authRouter } from './routes/auth';
import { insightRouter } from './routes/insight';
import { notesRouter } from './routes/notes';
import { postsRouter } from './routes/posts';
import { usersRouter } from './routes/users';
import { authenticate, requireRole } from './middleware/auth';

export const app = express();

app.set('trust proxy', config.TRUST_PROXY);
app.use(helmet());
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(apiLimiter);
app.use(csrfGuard);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/notes', notesRouter);
app.use('/api/posts', postsRouter);
app.use('/api/users', usersRouter);
app.use('/api/insight', authenticate, requireRole('admin'), insightRouter);

app.use(notFound);
app.use(errorHandler);
