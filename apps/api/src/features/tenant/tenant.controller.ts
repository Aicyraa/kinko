import { createFactory } from 'hono/factory';
import { prisma } from '../../lib/prisma.ts';
import { requireAuth } from '../../middleware/requireAuth.ts';
import {
	requireTenant,
	requireTenantRole,
} from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import {
	serializeTenant,
	serializeTenantAnalytics,
} from '../../utils/serialize.ts';
import { validate } from '../../utils/validate.ts';
import {
	CreateTenantSchema,
	TenantIdParamSchema,
	UpdateTenantSchema,
} from './tenant.schema.ts';
import {
	createTenant,
	listTenantMembers,
	listUserTenants,
	setDefaultTenant,
	updateTenantName,
} from './tenant.service.ts';

const factory = createFactory<AppEnv>();

export const listTenants = factory.createHandlers(requireAuth, async (c) => {
	const user = c.get('user');
	const tenants = await listUserTenants(user.id);
	return successResponse(c, 'Workspaces fetched', { tenants }, 200);
});

export const createTenantHandler = factory.createHandlers(
	requireAuth,
	validate('json', CreateTenantSchema),
	async (c) => {
		const user = c.get('user');
		const { name } = c.req.valid('json');
		const tenant = await createTenant(user.id, name);
		return successResponse(c, 'Workspace created', { tenant }, 201);
	},
);

export const getTenantHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const analytics = await prisma.tenantAnalytics.findUnique({
			where: { tenantId: tenant.id },
		});

		return successResponse(
			c,
			'Workspace fetched',
			{
				tenant: {
					...serializeTenant(tenant),
					role: membership.role,
					analytics: serializeTenantAnalytics(analytics),
				},
			},
			200,
		);
	},
);

export const updateTenantHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	requireTenantRole('OWNER', 'ADMIN'),
	validate('param', TenantIdParamSchema),
	validate('json', UpdateTenantSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const { name } = c.req.valid('json');

		const updated = await updateTenantName(tenant.id, name, membership.role);
		return successResponse(c, 'Workspace updated', { tenant: updated }, 200);
	},
);

export const setDefaultTenantHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	async (c) => {
		const user = c.get('user');
		const tenant = c.get('tenant');
		const profile = await setDefaultTenant(user.id, tenant.id);
		return successResponse(c, 'Default workspace updated', { profile }, 200);
	},
);

export const listMembersHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	async (c) => {
		const tenant = c.get('tenant');
		const members = await listTenantMembers(tenant.id);
		return successResponse(c, 'Workspace members fetched', { members }, 200);
	},
);
