import {
	createAuthServer,
	extractNeonAuthCookies,
	serializeSetCookie
} from '@neon/auth/server'
import { getContext } from 'hono/context-storage'
import { env } from '../env.ts'

export const serverAuth = createAuthServer({
	baseUrl: env.NEON_AUTH_URL,
	cookieSecret: env.NEON_AUTH_COOKIE_SECRET,
	context: () => {
		const c = getContext()
		return {
			getCookies: () => extractNeonAuthCookies(c.header('cookie') ?? ''),
			setCookie: (name, value, options) =>
				c.header(
					'Set-Cookie',
					serializeSetCookie({ name, value, ...options }),
					{ append: true }
				),
			getHeader: name => c.req.header(name) ?? null,
			getOrigin: () => c.req.header('origin') ?? '',
			getFramework: () => 'hono'
		}
	}
})
