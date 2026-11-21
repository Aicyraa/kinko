import { handleAuthProxyRequest } from '@neon/auth/server';
import { Hono } from 'hono';
import { env } from '../env.ts';
import { serverAuth } from '../lib/serverAuth.ts';

export const auth = new Hono()
	.get('/me', async (c) => {
		const { data } = await serverAuth.getSession();
		if (!data?.session)
			return c.json({ status: 'not authenticated', code: 401 }, 401);
		return c.json({ status: 'successfull', user: data.user });
	})
	.all('/*', async (c) => {
		const path = c.req.path.replace(/^\/api\/v1\/auth\/?/, '');
		return handleAuthProxyRequest({
			request: c.req.raw,
			path,
			baseUrl: env.NEON_AUTH_URL,
			cookieSecret: env.NEON_AUTH_COOKIE_SECRET,
		});
	});
