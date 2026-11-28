import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './env.ts';
import { auth } from './features/auth/auth.route.ts';
import { files } from './features/files/files.route.ts';
import { folder } from './features/folder/folder.route.ts';
import { health } from './features/health/health.route.ts';
import { search } from './features/search/search.route.ts';
import { tenant } from './features/tenant/tenant.route.ts';
import { trash } from './features/trash/trash.route.ts';
import { uploads } from './features/uploads/uploads.route.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { requestLogger } from './middleware/logger.ts';
import { notFound } from './middleware/notFound.ts';
import type { AppEnv } from './types.ts';

export const app = new Hono<AppEnv>().basePath('/api/v1');

const allowedOrigins = new Set<string>([env.CLIENT_BASE_URL]);
if (process.env.VERCEL_URL) {
	allowedOrigins.add(`https://${process.env.VERCEL_URL}`);
}
if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
	allowedOrigins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
}

app.use(
	'*',
	cors({
		origin: (origin) => (allowedOrigins.has(origin) ? origin : ''),
		allowHeaders: [
			'Content-Type',
			'Authorization',
			'X-Tenant-Id',
			'X-Custom-Header',
			'Upgrade-Insecure-Requests',
		],
		allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		exposeHeaders: ['Content-Length', 'Content-Disposition'],
		maxAge: 600,
		credentials: true,
	}),
);
app.use('*', secureHeaders());
app.use('*', contextStorage());
app.use('*', requestLogger);

app.onError(errorHandler);
app.notFound(notFound);

const routes = app
	.route('/health', health)
	.route('/auth', auth)
	.route('/tenants', tenant)
	.route('/folders', folder)
	.route('/files', files)
	.route('/uploads', uploads)
	.route('/trash', trash)
	.route('/search', search);

export type AppType = typeof routes;
export default app;
