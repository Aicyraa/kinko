import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import {
	AccessPublicShareSchema,
	CreateShareSchema,
	ShareFileParamSchema,
	ShareIdParamSchema,
	ShareTokenParamSchema,
} from './shares.schema.ts';
import {
	accessPublicShare,
	createFileShare,
	getPublicShareMetadata,
	listFileShares,
	revokeFileShare,
} from './shares.service.ts';

const factory = createFactory<AppEnv>();

export const getPublicShareHandler = factory.createHandlers(
	validate('param', ShareTokenParamSchema),
	async (c) => {
		const { token } = c.req.valid('param');
		const data = await getPublicShareMetadata(token);
		return successResponse(c, 'Share metadata fetched', data, 200);
	},
);

export const accessPublicShareHandler = factory.createHandlers(
	validate('param', ShareTokenParamSchema),
	validate('json', AccessPublicShareSchema),
	async (c) => {
		const { token } = c.req.valid('param');
		const body = c.req.valid('json');
		const data = await accessPublicShare(token, body);
		return successResponse(c, 'Share access granted', data, 200);
	},
);

export const listFileSharesHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', ShareFileParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const data = await listFileShares(tenant.id, membership, user.id, fileId);
		return successResponse(c, 'File shares fetched', data, 200);
	},
);

export const createShareHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('json', CreateShareSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const body = c.req.valid('json');
		const data = await createFileShare(tenant.id, membership, user.id, body);
		return successResponse(c, 'Share link created', data, 201);
	},
);

export const revokeShareHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', ShareIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { shareId } = c.req.valid('param');
		const data = await revokeFileShare(tenant.id, membership, user.id, shareId);
		return successResponse(c, 'Share link revoked', data, 200);
	},
);
