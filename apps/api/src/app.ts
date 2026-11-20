import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { errorHandler } from './middleware/error-handler.ts';
import { requestLogger } from './middleware/logger.ts';
import { notFound } from './middleware/not-found.ts';
import { health } from './routes/health.route.ts';

export const app = new Hono().basePath('/api/v1');

app.use('*', contextStorage());
app.use('*', requestLogger);

app.onError(errorHandler);
app.notFound(notFound);

app.route('/health', health);
