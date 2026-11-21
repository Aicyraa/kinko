import { handleAuthProxyRequest } from '@neon/auth/server'
import { Hono } from 'hono'
import { env } from '../env.ts'
import { serverAuth } from '../lib/serverAuth.ts'
import { zValidator } from '@hono/zod-validator'
import z, { keyof } from 'zod'
import { zhCN } from 'zod/locales'

const SignUpSchema = z
	.object({
		name: z.string().trim().min(1, 'name cannot be less than 1'),
		email: z.email('not a valid email').trim(),
		password: z
			.string()
			.min(8, 'Password must be at least 8 characters')
			.max(64, 'Password must be 64 characters or fewer')
			.regex(
				/[A-Z]/,
				'Password must contain at least one uppercase letter'
			)
			.regex(
				/[a-z]/,
				'Password must contain at least one lowercase letter'
			)
			.regex(/[0-9]/, 'Password must contain at least one number')
			.regex(
				/[^A-Za-z0-9]/,
				'Password must contain at least one special character'
			),
		passwordConfirm: z.string().min(1, 'password doesnt match')
	})
	.refine(data => data.password === data.passwordConfirm, {
		error: issue => `password doesn't match ${issue.input}`
	})

const SingInSchema = z.object({
	email: z.email('not a valid email').trim(),
	password: z
		.string()
		.min(8, 'Password must be at least 8 characters')
		.max(64, 'Password must be 64 characters or fewer')
		.regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
		.regex(/[a-z]/, 'Password must contain at least one lowercase letter')
		.regex(/[0-9]/, 'Password must contain at least one number')
		.regex(
			/[^A-Za-z0-9]/,
			'Password must contain at least one special character'
		)
})

export const auth = new Hono()
	.post('/signup', zValidator('form', SignUpSchema), async c => {
		const validated = c.req.valid('form')

		const { data, error } = await serverAuth.signUp.email({
			email: validated.email,
			password: validated.password,
			name: validated.name,
			callbackURL: `${env.CLIENT_BASE_URL}/`
		})

		if (error) {
			return c.json(
				{
					status: 'account creation failed',
					code: error.code,
					cause: {
						message: error.message
					}
				},
				422
			)
		}

		return c.json(
			{
				status: 'user created',
				code: 201,
				payload: {
					user: data?.user,
					token: data?.token
				}
			},
			201
		)
	})
	.post('/signin', zValidator('form', SingInSchema), async c => {
		const validated = c.req.valid('form')

		const { data, error } = await serverAuth.signIn.email({
			email: validated.email,
			password: validated.password
		})

        
		if (error) {
			return c.json(
				{
					status: 'account creation failed',
					code: error.code,
					cause: {
						message: error.message
					}
				},
				422
			)
		}

		return c.json({ status: 'successfully sign in', code: 200, payload: {
            user: data?.user,
            token: data?.token
        } })
	})
	.get('/me', async c => {
		const { data } = await serverAuth.getSession()
		if (!data?.session)
			return c.json({ status: 'not authenticated', code: 401 }, 401)
		return c.json({ status: 'successfull', user: data.user })
	})
	.all('/*', async c => {
		const path = c.req.path.replace(/^\/api\/v1\/auth\/?/, '')
		return handleAuthProxyRequest({
			request: c.req.raw,
			path,
			baseUrl: env.NEON_AUTH_URL,
			cookieSecret: env.NEON_AUTH_COOKIE_SECRET
		})
	})
