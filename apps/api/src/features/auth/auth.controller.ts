import { createFactory } from 'hono/factory'
import { serverAuth } from '../../lib/serverAuth.ts'
import { errorResponse, successResponse } from '../../utils/response.ts'
import { handleAuthProxyRequest } from '@neon/auth/server'
import { env } from '../../env.ts'
import type { SignInType, SignUpType } from './auth.schema.ts'

const factory = createFactory()

export const checkSession = factory.createHandlers(async c => {
	const { data } = await serverAuth.getSession()

	if (!data?.session) {
		return errorResponse(c, 'Not Authenticated', 401)
	}

	return successResponse<typeof data.user>(c, 'Authenticated', data.user, 200)
})

export const signup = factory.createHandlers(async c => {
	const validated = c.req.valid('form') as SignUpType

    const { data, error } = await serverAuth.signUp.email({
		email: validated.email,
		password: validated.password,
		name: validated.name,
		callbackURL: `${env.CLIENT_BASE_URL}/`
	})

    if (error) {
        return errorResponse<string>(c, error.message as string, error.message, 422)
    }
    
    return successResponse<typeof data.user>(c, 'user created', data.user, 201)
})

export const signin = factory.createHandlers(async c => {
    const validated = c.req.valid('form') as SignInType ;
    
    const { data, error } = await serverAuth.signIn.email({
        email: validated.email,
        password: validated.password,
    });
    
    if (error) {
        return errorResponse(c, error.message as string, 422, )
    }

    return successResponse<typeof data.user>(c, 'successfully logged in', 200, data.user)
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
