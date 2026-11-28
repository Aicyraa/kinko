import { handleAuthProxyRequest } from '@neon/auth/server';
import { createFactory } from 'hono/factory';
import { env } from '../../env.ts';
import { serverAuth } from '../../lib/serverAuth.ts';
import type { AppEnv } from '../../types.ts';
import { errorResponse, successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import {
	ensureUserOnboarded,
	serializeOnboardedState,
} from '../tenant/tenant.service.ts';
import { SignInSchema, SignUpSchema } from './auth.schema.ts';

const factory = createFactory<AppEnv>();

export const checkSession = factory.createHandlers(async (c) => {
	const { data } = await serverAuth.getSession();

	if (!data?.session || !data.user) {
		return errorResponse(c, 'Not authenticated', {}, 401);
	}

	const onboarded = await ensureUserOnboarded({
		id: data.user.id,
		name: data.user.name,
		email: data.user.email,
	});
	const { profile, tenants } = serializeOnboardedState(onboarded);

	return successResponse(
		c,
		'Authenticated',
		{
			user: data.user,
			profile,
			defaultTenantId: profile.defaultTenantId,
			tenants,
		},
		200,
	);
});

export const signup = factory.createHandlers(
	validate('json', SignUpSchema),
	async (c) => {
		const validated = c.req.valid('json');

		const { data, error } = await serverAuth.signUp.email({
			email: validated.email,
			password: validated.password,
			name: validated.name,
			callbackURL: `${env.CLIENT_BASE_URL}/`,
		});

		if (error) {
			return errorResponse(
				c,
				error.message ?? error.statusText ?? 'Sign up failed',
				{ reason: error.message ?? error.statusText },
				422,
			);
		}

		if (data?.user) {
			const onboarded = await ensureUserOnboarded({
				id: data.user.id,
				name: data.user.name,
				email: data.user.email,
			});
			const { profile, tenants } = serializeOnboardedState(onboarded);
			return successResponse(
				c,
				'User created',
				{
					user: data.user,
					profile,
					defaultTenantId: profile.defaultTenantId,
					tenants,
				},
				201,
			);
		}

		return successResponse(c, 'User created', { user: null }, 201);
	},
);

export const signin = factory.createHandlers(
	validate('json', SignInSchema),
	async (c) => {
		const validated = c.req.valid('json');

		const { data, error } = await serverAuth.signIn.email({
			email: validated.email,
			password: validated.password,
		});

		if (error || !data?.user) {
			return errorResponse(
				c,
				error?.message ?? error?.statusText ?? 'Invalid email or password',
				{},
				401,
			);
		}

		const onboarded = await ensureUserOnboarded({
			id: data.user.id,
			name: data.user.name,
			email: data.user.email,
		});
		const { profile, tenants } = serializeOnboardedState(onboarded);

		return successResponse(
			c,
			'Successfully logged in',
			{
				user: data.user,
				profile,
				defaultTenantId: profile.defaultTenantId,
				tenants,
			},
			200,
		);
	},
);

export const signout = factory.createHandlers(async (c) => {
	const { error } = await serverAuth.signOut();

	if (error) {
		return errorResponse(c, error.message ?? 'Sign out failed', {}, 500);
	}

	return successResponse(c, 'Successfully signed out', {}, 200);
});

export const neonHandler = factory.createHandlers(async (c) => {
	const path = c.req.path.replace(/^\/api\/v1\/auth\/?/, '');
	return handleAuthProxyRequest({
		request: c.req.raw,
		path,
		baseUrl: env.NEON_AUTH_URL,
		cookieSecret: env.NEON_AUTH_COOKIE_SECRET,
	});
});
