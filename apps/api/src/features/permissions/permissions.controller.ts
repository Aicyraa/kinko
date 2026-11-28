import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import {
	FilePermissionParamSchema,
	FilePermissionUserParamSchema,
	UpsertFilePermissionSchema,
} from './permissions.schema.ts';
import {
	listFilePermissions,
	removeFilePermission,
	upsertFilePermission,
} from './permissions.service.ts';

const factory = createFactory<AppEnv>();

export const listFilePermissionsHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FilePermissionParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const result = await listFilePermissions(
			tenant.id,
			membership,
			user.id,
			fileId,
		);
		return successResponse(c, 'File permissions fetched', result, 200);
	},
);

export const upsertFilePermissionHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FilePermissionParamSchema),
	validate('json', UpsertFilePermissionSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const { userId, role } = c.req.valid('json');
		const permission = await upsertFilePermission(
			tenant.id,
			membership,
			user.id,
			fileId,
			userId,
			role,
		);
		return successResponse(c, 'File permission updated', { permission }, 200);
	},
);

export const removeFilePermissionHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FilePermissionUserParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId, userId } = c.req.valid('param');
		const result = await removeFilePermission(
			tenant.id,
			membership,
			user.id,
			fileId,
			userId,
		);
		return successResponse(c, 'File permission removed', result, 200);
	},
);
