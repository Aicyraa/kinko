import type { Context, Next } from 'hono';
import { serverAuth } from '../lib/serverAuth.ts';

export async function requireAuth(c: Context, next: Next) {
	const { data } = await serverAuth.getSession();

	if (!data?.session || !data.user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	c.set('user', data.user);
	c.set('session', data.session);
	await next();
}
