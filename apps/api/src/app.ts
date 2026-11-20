import { Hono } from 'hono';
import { env } from './env.ts';
import { contextStorage } from 'hono/context-storage';
import { secureHeaders } from 'hono/secure-headers';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/error-handler.ts';
import { requestLogger } from './middleware/logger.ts';
import { notFound } from './middleware/not-found.ts';
import { health } from './routes/health.route.ts';
import { auth } from './routes/auth.route.ts';

export const app = new Hono().basePath('/api/v1');


app.use('*', cors({
    origin: env.CLIENT_BASE_URL,
    allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
    exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
    maxAge: 600,
    credentials: true,
}))
app.use('*', secureHeaders())
app.use('*', contextStorage());
app.use('*', requestLogger);

app.onError(errorHandler);
app.notFound(notFound);

app.route('/health', health);
app.route('/auth', auth)