import {
	createAuthServer,
	extractNeonAuthCookies,
	serializeSetCookie,
} from '@neon/auth/server';
import { getContext } from 'hono/context-storage';
import { env } from '../env.ts';

export const serverAuth = createAuthServer({
	baseUrl: env.NEON_AUTH_URL,
	cookieSecret: env.NEON_AUTH_COOKIE_SECRET,
	context: () => {
		const c = getContext();
		return {
			getCookies: () => extractNeonAuthCookies(c.header('cookie') ?? ''),
			setCookie: (name, value, options) =>
				c.header(
					'Set-Cookie',
					serializeSetCookie({ name, value, ...options }),
					{ append: true },
				),
			getHeader: (name) => c.req.header(name) ?? null,
			getOrigin: () => {
				const origin = c.req.header('origin');
				if (origin) return origin;

				const referer = c.req.header('referer');
				if (referer) {
					try {
						return new URL(referer).origin;
					} catch {
						// malformed Referer — fall through to configured client URL
					}
				}

				// Non-browser callers (Bruno, backend jobs) send neither header.
				return new URL(env.CLIENT_BASE_URL).origin;
			},
			getFramework: () => 'hono',
		};
	},
});


