import type { Context, Next } from 'hono';
import { serverAuth } from '../lib/serverAuth.ts';
import { createMiddleware } from 'hono/factory';

export const requireAuth = createMiddleware(async (c, next) => {
    const { data } = await serverAuth.getSession();

	if (!data?.session || !data.user) {
		return c.json({ status: 'unauthorized', code: 401 }, 401);
	}

	c.set('user', data.user);
	c.set('session', data.session);
	await next();
})
