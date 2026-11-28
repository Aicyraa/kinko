import { createMiddleware } from 'hono/factory';
import { ensureUserOnboarded } from '../features/tenant/tenant.service.ts';
import { serverAuth } from '../lib/serverAuth.ts';
import type { AppEnv } from '../types.ts';
import { errorResponse } from '../utils/response.ts';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	const { data } = await serverAuth.getSession();

	if (!data?.session || !data.user) {
		return errorResponse(c, 'Unauthorized', {}, 401);
	}

	const userProfile = await ensureUserOnboarded({
		id: data.user.id,
		name: data.user.name,
		email: data.user.email,
	});

	c.set('user', data.user);
	c.set('session', data.session);
	c.set('userProfile', userProfile);
	await next();
});
