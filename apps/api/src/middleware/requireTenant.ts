import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import type { TenantRole } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.ts';
import type { AppEnv } from '../types.ts';
import { errorResponse } from '../utils/response.ts';

const uuidSchema = z.string().uuid();

/**
 * Resolves the target tenant from `:tenantId` route param, `X-Tenant-Id` header,
 * or the user's `defaultTenantId`, and verifies the caller is a member.
 * Always returns 403 Forbidden on non-membership or invalid IDs without leaking existence.
 */
export const requireTenant = createMiddleware<AppEnv>(async (c, next) => {
	const user = c.get('user');
	const userProfile = c.get('userProfile');

	const rawTenantId =
		c.req.param('tenantId') ??
		c.req.header('x-tenant-id') ??
		userProfile?.defaultTenantId ??
		undefined;

	if (!rawTenantId || !uuidSchema.safeParse(rawTenantId).success) {
		return errorResponse(c, 'Forbidden', {}, 403);
	}

	const membership = await prisma.tenantMember.findUnique({
		where: {
			tenantId_userId: {
				tenantId: rawTenantId,
				userId: user.id,
			},
		},
		include: { tenant: true },
	});

	if (!membership) {
		return errorResponse(c, 'Forbidden', {}, 403);
	}

	c.set('tenant', membership.tenant);
	c.set('tenantMembership', membership);
	await next();
});

export const requireTenantRole = (...allowedRoles: TenantRole[]) =>
	createMiddleware<AppEnv>(async (c, next) => {
		const membership = c.get('tenantMembership');

		if (!membership || !allowedRoles.includes(membership.role)) {
			return errorResponse(c, 'Forbidden', {}, 403);
		}

		await next();
	});
