import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import {
	requireTenant,
	requireTenantRole,
} from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import { purgeExpiredTrash } from './trash.cleanup.ts';
import {
	RestoreTrashBodySchema,
	TrashItemParamSchema,
} from './trash.schema.ts';
import {
	listTrash,
	permanentlyDeleteTrashItem,
	restoreTrashItem,
} from './trash.service.ts';

const factory = createFactory<AppEnv>();

export const listTrashHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	async (c) => {
		const tenant = c.get('tenant');
		const data = await listTrash(tenant.id);
		return successResponse(c, 'Trash items fetched', data, 200);
	},
);

export const restoreTrashHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', TrashItemParamSchema),
	validate('json', RestoreTrashBodySchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { itemId } = c.req.valid('param');
		const body = c.req.valid('json');
		const result = await restoreTrashItem(
			tenant.id,
			user.id,
			itemId,
			body?.kind,
		);
		return successResponse(c, 'Item restored from trash', result, 200);
	},
);

export const permanentDeleteTrashHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', TrashItemParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { itemId } = c.req.valid('param');
		const result = await permanentlyDeleteTrashItem(
			tenant.id,
			user.id,
			itemId,
		);
		return successResponse(c, 'Item permanently deleted', result, 200);
	},
);

export const cleanupTrashHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	requireTenantRole('OWNER', 'ADMIN'),
	async (c) => {
		const tenant = c.get('tenant');
		const result = await purgeExpiredTrash({ tenantId: tenant.id });
		return successResponse(c, 'Expired trash cleaned up', result, 200);
	},
);
