import { Hono } from 'hono';
import { hc } from 'hono/client';
import { contextStorage } from 'hono/context-storage';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './env.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { requestLogger } from './middleware/logger.ts';
import { notFound } from './middleware/notFound.ts';
import { auth } from './routes/auth.route.ts';
import { health } from './routes/health.route.ts';

export const app = new Hono().basePath('/api/v1');

app.use(
	'*',
	cors({
		origin: env.CLIENT_BASE_URL,
		allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
		exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
		maxAge: 600,
		credentials: true,
	}),
);
app.use('*', secureHeaders());
app.use('*', contextStorage());
app.use('*', requestLogger);

app.onError(errorHandler);
app.notFound(notFound);

const routes = app.route('/health', health).route('/auth', auth);

export type AppType = typeof routes