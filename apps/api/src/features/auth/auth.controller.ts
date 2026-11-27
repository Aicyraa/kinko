import { zValidator } from '@hono/zod-validator'
import { handleAuthProxyRequest } from '@neon/auth/server'
import { createFactory } from 'hono/factory'
import { env } from '../../env.ts'
import { serverAuth } from '../../lib/serverAuth.ts'
import { errorResponse, successResponse } from '../../utils/response.ts'
import { SignUpSchema, SingInSchema } from './auth.schema.ts'

const factory = createFactory()

export const checkSession = factory.createHandlers(async c => {
	const { data } = await serverAuth.getSession()

	if (!data?.session) {
		return errorResponse(c, 'Not Authenticated', 401)
	}

	return successResponse<typeof data.user>(c, 'Authenticated', data.user, 200)
})

export const signup = factory.createHandlers(
	zValidator('form', SignUpSchema),
	async c => {
		const validated = c.req.valid('form')

		const { data, error } = await serverAuth.signUp.email({
			email: validated.email,
			password: validated.password,
			name: validated.name,
			callbackURL: `${env.CLIENT_BASE_URL}/`,
		})

		if (error) {
			return errorResponse<string>(
				c,
				error.message ?? error.statusText,
				error.message ?? error.statusText,
				422,
			)
		}

		return successResponse<typeof data.user>(c, 'user created', data.user, 201)
	},
)

export const signin = factory.createHandlers(
	zValidator('form', SingInSchema),
	async c => {
		const validated = c.req.valid('form')

		const { data, error } = await serverAuth.signIn.email({
			email: validated.email,
			password: validated.password,
		})

		if (error) {
			return errorResponse(c, error.message ?? error.statusText, {}, 422)
		}

		return successResponse<typeof data.user>(
			c,
			'successfully logged in',
			data.user,
			200,
		)
	},
)

export const signout = factory.createHandlers(async c => {
	const { error } = await serverAuth.signOut()

	if (error) {
		return errorResponse(c, error.message ?? 'Sign out failed')
	}

	return successResponse(c, 'Successfully signed out')
})

export const neonHandler = factory.createHandlers(async c => {
	const path = c.req.path.replace(/^\/api\/v1\/auth\/?/, '')
	return handleAuthProxyRequest({
		request: c.req.raw,
		path,
		baseUrl: env.NEON_AUTH_URL,
		cookieSecret: env.NEON_AUTH_COOKIE_SECRET
	})
})
